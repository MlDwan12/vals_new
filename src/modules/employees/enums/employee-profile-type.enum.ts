// Площадка внешнего профиля сотрудника (sameAs). По ней сайт подбирает подпись и иконку; OTHER —
// всё, что не попало в список (публикация в СМИ, личный блог на чужом движке и т.п.).
export enum EmployeeProfileType {
  TELEGRAM = 'telegram',
  VK = 'vk',
  DZEN = 'dzen',
  VC = 'vc',
  HABR = 'habr',
  YOUTUBE = 'youtube',
  RUTUBE = 'rutube',
  LINKEDIN = 'linkedin',
  WEBSITE = 'website',
  OTHER = 'other',
}
