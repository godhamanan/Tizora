export function occasionImg(
  o: { imgMale: string; imgFemale: string },
  gender?: string | null
): string {
  return gender === 'female' ? o.imgFemale : o.imgMale;
}
