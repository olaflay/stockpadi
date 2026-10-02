import { describe, it, expect } from "vitest";
import {
  computeCounts,
  filterContacts,
  type ContactRow,
} from "../contacts-filter";

describe("contacts-filter logic", () => {
  const sampleRows: ContactRow[] = [
    {
      id: "c-1",
      customerId: "cust-1",
      name: "Abubakar Musa",
      phone: "08031112233",
      kinds: ["customer"],
      balance: 15000,
      debtAgeDays: 5,
    },
    {
      id: "c-2",
      customerId: "cust-2",
      name: "Blessing Okon",
      phone: "08022223344",
      kinds: ["customer"],
      balance: 0,
      debtAgeDays: 0,
    },
    {
      id: "c-3",
      customerId: "cust-3",
      supplierId: "supp-1",
      name: "Chinedu Stores",
      phone: "08055556677",
      kinds: ["customer", "supplier"],
      balance: 45000,
      debtAgeDays: 12,
    },
    {
      id: "s-1",
      supplierId: "supp-2",
      name: "Dangote Distributor",
      phone: "09011112233",
      kinds: ["supplier"],
      balance: 0,
      debtAgeDays: 0,
    },
  ];

  it("computes counts accurately across kinds and debtors", () => {
    const counts = computeCounts(sampleRows);
    expect(counts.all).toBe(4);
    expect(counts.debtors).toBe(2); // c-1 (15000) and c-3 (45000)
    expect(counts.customers).toBe(3); // c-1, c-2, c-3
    expect(counts.suppliers).toBe(2); // c-3, s-1
  });

  it("filters debtors correctly and sorts balance descending", () => {
    const debtors = filterContacts(sampleRows, "debtors", "");
    expect(debtors).toHaveLength(2);
    expect(debtors[0].name).toBe("Chinedu Stores"); // 45,000
    expect(debtors[1].name).toBe("Abubakar Musa"); // 15,000
  });

  it("filters suppliers correctly and sorts alphabetically", () => {
    const suppliers = filterContacts(sampleRows, "suppliers", "");
    expect(suppliers).toHaveLength(2);
    expect(suppliers.map((s) => s.name)).toEqual(["Chinedu Stores", "Dangote Distributor"]);
  });

  it("filters customers correctly", () => {
    const customers = filterContacts(sampleRows, "customers", "");
    expect(customers).toHaveLength(3);
    expect(customers.map((c) => c.name)).toEqual([
      "Abubakar Musa",
      "Blessing Okon",
      "Chinedu Stores",
    ]);
  });

  it("searches contacts by name case-insensitively", () => {
    const results = filterContacts(sampleRows, "all", "blessing");
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("Blessing Okon");
  });

  it("searches contacts by phone number", () => {
    const results = filterContacts(sampleRows, "all", "555566");
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("Chinedu Stores");
  });

  it("returns empty array when search finds no matches", () => {
    const results = filterContacts(sampleRows, "all", "nonexistent-query");
    expect(results).toHaveLength(0);
  });
});
