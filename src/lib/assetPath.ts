const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/**
 * @brief basePath を考慮した公開アセットURLを返す
 * @param path 先頭 `/` 付きの公開パス
 * @returns basePath 適用後のURL
 */
export function withBasePath(path: string): string {
  if (!BASE_PATH) return path;
  if (path === BASE_PATH || path.startsWith(`${BASE_PATH}/`)) return path;
  if (path.startsWith("/")) return `${BASE_PATH}${path}`;
  return `${BASE_PATH}/${path}`;
}
