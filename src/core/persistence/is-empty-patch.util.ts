// PATCH {} (валидный, но бессмысленный запрос) передаётся в TypeORM Repository.update() как
// пустой объект — тот бросает UpdateValuesMissingError, необработанное падает 500-й вместо
// no-op'а (LOW code review). Проверка перед вызовом update() — дешевле, чем try/catch вокруг
// каждого repo.update().
export function isEmptyPatch(patch: object): boolean {
  return Object.keys(patch).length === 0;
}
