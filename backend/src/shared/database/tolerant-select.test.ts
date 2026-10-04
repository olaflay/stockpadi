import { describe, it, expect, vi } from "vitest";
import { tolerantSelect } from "./tolerant-select.js";

describe("tolerantSelect", () => {
  it("queries base and evolutionary columns when schema is up to date", async () => {
    const mockQuery = vi.fn().mockResolvedValue({
      data: [{ id: "1", name: "Item", extra_col: "extra" }],
      error: null,
    });

    const result = await tolerantSelect(mockQuery, {
      table: "test_table",
      baseColumns: ["id", "name"],
      evolutionaryColumns: ["extra_col"],
    });

    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockQuery).toHaveBeenCalledWith("id, name, extra_col");
    expect(result).toEqual([{ id: "1", name: "Item", extra_col: "extra" }]);
  });

  it("gracefully falls back to base columns when PostgreSQL returns 42703 (undefined_column)", async () => {
    const mockQuery = vi.fn()
      .mockResolvedValueOnce({
        data: null,
        error: { code: "42703", message: "column extra_col does not exist" },
      })
      .mockResolvedValueOnce({
        data: [{ id: "1", name: "Item" }],
        error: null,
      });

    const result = await tolerantSelect(mockQuery, {
      table: "test_table",
      baseColumns: ["id", "name"],
      evolutionaryColumns: ["extra_col"],
    });

    expect(mockQuery).toHaveBeenCalledTimes(2);
    expect(mockQuery).toHaveBeenNthCalledWith(1, "id, name, extra_col");
    expect(mockQuery).toHaveBeenNthCalledWith(2, "id, name");
    expect(result).toEqual([{ id: "1", name: "Item" }]);
  });

  it("throws real database errors (e.g. 500 or network failure) without falling back", async () => {
    const mockQuery = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "50000", message: "Internal server connection failure" },
    });

    await expect(
      tolerantSelect(mockQuery, {
        table: "test_table",
        baseColumns: ["id", "name"],
        evolutionaryColumns: ["extra_col"],
      })
    ).rejects.toMatchObject({ code: "50000" });

    expect(mockQuery).toHaveBeenCalledTimes(1);
  });
});
