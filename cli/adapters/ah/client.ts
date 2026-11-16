/** A product as AH's REST search (`/mobile-services/product/search/v2`) returns it. Only the fields the gateway reads. */
export type AhProduct = {
  webshopId: number;
  title: string;
  brand?: string;
  salesUnitSize?: string;
  priceBeforeBonus?: number;
  /** Only set while the product is on Bonus. */
  currentPrice?: number;
  isBonus?: boolean;
  bonusMechanism?: string;
  isOrderable?: boolean;
  isSponsored?: boolean;
  /** Only set with the user token. */
  isPreviouslyBought?: boolean;
};

/**
 * AH's unofficial app API, as raw as AH returns it: the part of the AH gateway that is swapped for a fake.
 * The real one runs the Go `ahdump` tool; the fake keeps its state in JSON files.
 * Both read and write the user token in the token file they were made with.
 */
export interface AhClient {
  /** Runs the browser login and writes the user token to the token file. */
  login(): Promise<void>;
  /** Renews the user token now (AH rotates the refresh token on every renewal). */
  refreshLogin(): Promise<void>;
  /** Product search in AH's relevance order, with an anonymous token or the user token. */
  searchProducts(query: string, token: "anonymous" | "user"): Promise<AhProduct[]>;
  /** Product search with the user token, most frequently bought first (`sortOn=PURCHASE_FREQUENCY`). */
  searchByPurchaseFrequency(query: string): Promise<AhProduct[]>;
}

/** A problem with AH that the person running `food` can act on; printed without a stack trace. */
export class AhError extends Error {}

export class AhLoginError extends AhError {
  constructor(message = "Not logged in to AH. Run `food ah login` first.") {
    super(message);
  }
}
