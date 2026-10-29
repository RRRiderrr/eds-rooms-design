/** Match the editor's character limit in import/export and rendering. Explicit
 * paragraph breaks and an intentionally empty plaque are valid user content. */
export const MAX_PLAQUE_LABEL_LENGTH=500;
export function normalizePlaqueLabel(value:string):string {
 return value.replace(/\r\n?/g,'\n').slice(0,MAX_PLAQUE_LABEL_LENGTH);
}
