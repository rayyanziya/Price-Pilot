export function normalizeBrand(brand: string): string {
  return brand.trim().replace(/\s+/g, " ");
}

export function normalizeModelText(model: string): string {
  return model.trim().replace(/\s+/g, " ");
}

export function normalizeModelKey(model: string): string {
  return normalizeModelText(model).toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function normalizeConditionGrade(input: string): "A" | "B" | "C" | "D" {
  const value = input.trim().toUpperCase();

  if (["A", "B", "C", "D"].includes(value)) {
    return value as "A" | "B" | "C" | "D";
  }

  const aliases: Record<string, "A" | "B" | "C" | "D"> = {
    LIKE_NEW: "A",
    EXCELLENT: "A",
    VERY_GOOD: "B",
    GOOD: "B",
    FAIR: "C",
    POOR: "D",
  };

  return aliases[value] ?? "C";
}
