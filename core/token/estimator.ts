export function estimateTokenUnits(text: string): number {
  let tokens = 0;
  for (const char of text) {
    tokens += char.charCodeAt(0) > 0x7F ? 1.5 : 0.25;
  }
  return tokens;
}

export function estimateTokens(text: string): number {
  return Math.ceil(estimateTokenUnits(text));
}
