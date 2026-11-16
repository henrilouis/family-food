import { readFile } from "node:fs/promises";
import path from "node:path";
import { UserError } from "./user-error.ts";

/** Reads an input file of JSON. One that can't be read or isn't JSON is a UserError: "<file> is not <what>: <why>". */
export async function readJsonFile(file: string, what: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path.resolve(file), "utf8"));
  } catch (error) {
    throw new UserError(`${file} is not ${what}: ${(error as Error).message}`);
  }
}
