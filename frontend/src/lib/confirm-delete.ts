/** 削除前の確認。キャンセル時は false。 */
export function confirmDelete(message: string, detail?: string): boolean {
  const body = detail ? `${message}\n\n${detail}` : `${message}\n\nこの操作は取り消せません。`;
  return window.confirm(body);
}

/** 「対象名」を削除する確認。 */
export function confirmDeleteTarget(target: string): boolean {
  return confirmDelete(`「${target}」を削除します。よろしいですか？`);
}
