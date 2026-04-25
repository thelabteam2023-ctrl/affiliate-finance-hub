import { describe, expect, it } from "vitest";
import { collectApostaBookmakerIds } from "../apostaFilterHelpers";

describe("apostaFilterHelpers", () => {
  it("coleta bookmaker_ids dentro de pernas agrupadas com entries", () => {
    const ids = collectApostaBookmakerIds({
      bookmaker_id: "parent",
      pernas: [
        {
          bookmaker_id: "main-leg",
          entries: [
            { bookmaker_id: "entry-1" },
            { bookmaker_id: "entry-2" },
          ],
        },
      ],
    });

    expect([...ids].sort()).toEqual(["entry-1", "entry-2", "main-leg", "parent"]);
  });
});
