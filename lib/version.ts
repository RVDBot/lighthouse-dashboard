import pkg from '../package.json'

export interface VersionInfo {
  version: string
  gitHash: string | null
  gitHashShort: string | null
  buildTime: string | null
}

export function getVersion(): VersionInfo {
  const hash = process.env.GIT_HASH && process.env.GIT_HASH !== 'dev' ? process.env.GIT_HASH : null
  const buildTime = process.env.BUILD_TIME && process.env.BUILD_TIME !== 'local' ? process.env.BUILD_TIME : null
  return {
    version: pkg.version,
    gitHash: hash,
    gitHashShort: hash ? hash.slice(0, 7) : null,
    buildTime,
  }
}
