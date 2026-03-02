export function assertNoFlagInjection(value: string, fieldName = "value"): void {
  if (value.startsWith("-")) {
    throw Object.assign(
      new Error(
        `invalid-input: ${fieldName} must not start with '-' (got: ${JSON.stringify(value)})`
      ),
      { category: "invalid-input" }
    );
  }
}

export function assertNoFlagInjectionList(values: string[], fieldName = "values"): void {
  for (const v of values) {
    assertNoFlagInjection(v, fieldName);
  }
}
