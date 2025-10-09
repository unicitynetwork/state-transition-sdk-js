/**
 * String dedent function, calculates distance which has to be removed from second line string
 * @param {TemplateStringsArray} strings - Template strings array
 * @param {unknown[]} data - Data to be inserted
 * @returns {string} - Dedented string
 */
export function dedent(strings: TemplateStringsArray, ...data: unknown[]): string {
  if (strings.length === 0) {
    return '';
  }

  let rows = strings[0].split('\n');
  if (rows.shift()?.length !== 0) {
    throw new Error('First line must be empty');
  }

  const whiteSpacesFromEdge = rows[0].length - rows[0].trimStart().length;
  const result: string[] = [];
  for (let j = 0; j < strings.length; j++) {
    result.push(
      `${result.pop() || ''}${rows[0].slice(Math.min(rows[0].length - rows[0].trim().length, whiteSpacesFromEdge))}`,
    );
    for (let i = 1; i < rows.length; i++) {
      result.push(rows[i].slice(whiteSpacesFromEdge));
    }

    const lastElement = result.pop();
    const whiteSpaces = lastElement!.length - lastElement!.trimStart().length;
    const dataRows = j < data.length ? String(data[j]).split('\n') : [''];
    result.push(`${lastElement}${dataRows[0]}`);
    for (let i = 1; i < dataRows.length; i++) {
      result.push(`${' '.repeat(whiteSpaces)}${dataRows[i]}`);
    }

    rows = j + 1 < strings.length ? strings[j + 1].split('\n') : [];
  }

  return result.join('\n');
}
