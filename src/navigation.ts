export type ReturnNavigationState = {
  returnTo: string
  returnLabel: string
}

type RouteLocation = {
  pathname: string
  search?: string
  hash?: string
}

const isSafeAppPath = (value: unknown): value is string => (
  typeof value === 'string' &&
  value.startsWith('/') &&
  !value.startsWith('//')
)

export const locationPath = ({ pathname, search = '', hash = '' }: RouteLocation) => `${pathname}${search}${hash}`

export const createReturnState = (returnTo: string, returnLabel: string): ReturnNavigationState => ({
  returnTo,
  returnLabel,
})

export const resolveReturnTarget = (
  state: unknown,
  fallbackTo: string,
  fallbackLabel: string,
  currentPath?: string,
): ReturnNavigationState => {
  const source = state && typeof state === 'object' ? state as Partial<ReturnNavigationState> : {}
  const sourceReturnTo = source.returnTo
  const hasValidSource = isSafeAppPath(sourceReturnTo) && sourceReturnTo !== currentPath
  const returnTo = hasValidSource ? sourceReturnTo : fallbackTo
  const returnLabel = hasValidSource && typeof source.returnLabel === 'string' && source.returnLabel.trim() ? source.returnLabel : fallbackLabel
  return { returnTo, returnLabel }
}
