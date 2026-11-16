import { execFile } from "node:child_process";
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { readConfig } from "../config.ts";

/**
 * The Kitchen Display Pi as seen from the Mac: the SSH host `kitchen` serving the web root below with Caddy.
 *
 *   /srv/kitchen/page/            the page (index.html, style.css, page.js), uploaded by `food deploy`
 *   /srv/kitchen/releases/<id>/   display bundles, uploaded by `food publish`
 *   /srv/kitchen/current          symlink to the release Caddy serves
 */
export interface DisplayTarget {
  /** Uploads `dir` (holding `setup.sh` and the files it installs) and runs `setup.sh` from it as root. Returns its output. */
  setup(dir: string): Promise<string>;
  /** Makes the web root's `page/` an exact copy of `dir`. */
  uploadPage(dir: string): Promise<void>;
}

export const SSH_HOST = "kitchen";
export const WEB_ROOT = "/srv/kitchen";
/** Where `setup` unpacks the setup folder, relative to the SSH user's home. */
const SETUP_DIR = "family-food-setup";

/** Something on the Kitchen Display Pi failed; the message holds what it printed. */
export class DisplayTargetError extends Error {}

/** The Pi could not be reached over SSH; nothing on it was changed by the step that failed. */
export class DisplayTargetUnreachable extends DisplayTargetError {}

/** The display target the local config asks for: the fake when `fakes["display-target"]` is set, else the Pi. */
export async function displayTarget(): Promise<DisplayTarget> {
  const fake = (await readConfig()).fakes?.["display-target"];
  return fake ? new FakeDisplayTarget(fake) : new SshDisplayTarget(SSH_HOST);
}

const ssh = ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=10"];

class SshDisplayTarget implements DisplayTarget {
  private host: string;
  constructor(host: string) {
    this.host = host;
  }

  async setup(dir: string): Promise<string> {
    // tar rather than rsync: a freshly flashed Pi may not have rsync yet; setup.sh installs it.
    const archive = await this.exec(["tar", "--create", "--no-xattrs", "--no-mac-metadata", "-C", dir, "."]);
    const remote = `rm -rf ${SETUP_DIR} && mkdir ${SETUP_DIR} && tar --extract -C ${SETUP_DIR} && sudo -n bash ${SETUP_DIR}/setup.sh`;
    return (await this.exec([...ssh, this.host, remote], archive)).toString();
  }

  async uploadPage(dir: string): Promise<void> {
    await this.rsync(dir, `${WEB_ROOT}/page/`);
  }

  private rsync(dir: string, remote: string): Promise<Buffer> {
    // --checksum: an unchanged file is left alone even though the Mac rebuilt it.
    const args = ["--recursive", "--checksum", "--delete", "--chmod=u=rwX,go=rX", "--rsh", ssh.join(" ")];
    return this.exec(["rsync", ...args, `${dir}/`, `${this.host}:${remote}`]);
  }

  private exec([command, ...args]: string[], input?: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const child = execFile(
        command,
        args,
        { encoding: "buffer", maxBuffer: 64 * 1024 * 1024, env: { ...process.env, COPYFILE_DISABLE: "1" } },
        (error, stdout, stderr) => {
          if (!error) return resolve(stdout);
          // ssh, and rsync through it, exit with 255 when the connection fails.
          if (error.code === 255) {
            reject(new DisplayTargetUnreachable(`Could not reach the Kitchen Display Pi (ssh ${this.host}).\n${stderr}`.trimEnd()));
          } else {
            reject(new DisplayTargetError(`${command} on the Kitchen Display Pi failed (exit ${error.code}).\n${stdout}${stderr}`.trimEnd()));
          }
        },
      );
      child.stdin?.end(input);
    });
  }
}

/** What the fake received and how it behaves, kept in `fake.json` in its folder. */
type FakeState = {
  /** Seeded by tests: behave as if the Pi is switched off. */
  unreachable?: boolean;
  /** The files of the last setup run, by name. */
  setup?: Record<string, string>;
};

/** A local folder standing in for the Pi's web root. */
class FakeDisplayTarget implements DisplayTarget {
  private root: string;
  constructor(root: string) {
    this.root = root;
  }

  async setup(dir: string): Promise<string> {
    const state = await this.state();
    const files: Record<string, string> = {};
    for (const name of (await readdir(dir)).sort()) files[name] = await readFile(path.join(dir, name), "utf8");
    await this.save({ ...state, setup: files });
    return "";
  }

  async uploadPage(dir: string): Promise<void> {
    await this.state();
    await rm(path.join(this.root, "page"), { recursive: true, force: true });
    await cp(dir, path.join(this.root, "page"), { recursive: true });
  }

  private async state(): Promise<FakeState> {
    const state: FakeState = JSON.parse(await readFile(path.join(this.root, "fake.json"), "utf8").catch(() => "{}"));
    if (state.unreachable) throw new DisplayTargetUnreachable(`Could not reach the Kitchen Display Pi (fake ${this.root}).`);
    return state;
  }

  private async save(state: FakeState): Promise<void> {
    await mkdir(this.root, { recursive: true });
    await writeFile(path.join(this.root, "fake.json"), JSON.stringify(state, null, 2) + "\n");
  }
}
