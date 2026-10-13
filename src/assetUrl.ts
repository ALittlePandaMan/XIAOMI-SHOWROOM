/** Public resources share Vite's base path on Docker and repository-hosted Pages. */
export function assetUrl(path:string,base=import.meta.env?.BASE_URL??'/'){
 return `${base.replace(/\/$/,'')}/${path.replace(/^\//,'')}`;
}
