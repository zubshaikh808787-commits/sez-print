/** Canvas placeholder for a bound data column. */
export function formatDataSourceColumn(columnName: string, showColumnName: boolean): string {
  if (!columnName) return '';
  return showColumnName ? columnName : `{${columnName}}`;
}
