// Upper bounds for ASCII advances at 20px, measured from the bundled DM Sans face,
// rounded up with a half-pixel guard. Non-ASCII uses a conservative two-em advance.
// Keeping this deterministic makes import/export bounds independent of font-load timing.
const advances = [5.5,5.5,6.5,16.5,12.5,16.5,15.5,3.5,7.5,7.5,10.5,11.5,4.5,11.5,4.5,8.5,14.5,6.5,12.5,12.5,12.5,12.5,13.5,11.5,12.5,13.5,4.5,5.5,11.5,11.5,11.5,10.5,20.5,13.5,12.5,14.5,14.5,11.5,11.5,15.5,14.5,5.5,10.5,12.5,11.5,17.5,14.5,15.5,12.5,15.5,12.5,12.5,11.5,13.5,13.5,19.5,12.5,12.5,11.5,6.5,8.5,6.5,12.5,13.5,4.5,11.5,13.5,11.5,13.5,11.5,7.5,11.5,12.5,5.5,5.5,10.5,4.5,18.5,11.5,12.5,13.5,13.5,7.5,10.5,8.5,11.5,11.5,15.5,10.5,11.5,9.5,9.5,5.5,9.5,11.5];

export function labelLines(text: string, width: number, fontSize: number) {
  const advance = (char: string): number => {
    if (char === "\t") return 22 * fontSize / 20;
    return (advances[char.codePointAt(0)! - 32] ?? 40) * fontSize / 20;
  };
  let lines = 0;
  for (const explicitLine of text.split(/\r\n|\r|\n/)) {
    lines++;
    let used = 0;
    for (const token of explicitLine.split(/([ \t]+)/)) {
      const chars = [...token];
      const tokenWidth = chars.reduce((sum, char) => sum + advance(char), 0);
      if (used && tokenWidth <= width && used + tokenWidth > width) {
        lines++;
        used = 0;
      }
      for (const char of chars) {
        const size = advance(char);
        if (used && used + size > width) {
          lines++;
          used = 0;
        }
        used += size;
      }
    }
  }
  return lines;
}
