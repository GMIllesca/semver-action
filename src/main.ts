import * as core from '@actions/core'
import * as github from '@actions/github'
import {GitHub} from '@actions/github/lib/utils'
import * as semver from 'semver'

export class Version {
  raw: string
  semver: semver.SemVer
  constructor(raw: string) {
    this.raw = raw
    // Extraer la parte semántica de la versión
    const versionMatch = raw.match(/(\d+\.\d+\.\d+)/)
    if (versionMatch) {
      this.semver = new semver.SemVer(versionMatch[0])
    } else {
      this.semver = new semver.SemVer('0.0.0')
    }
    core.info(`Parsed version: ${this.semver.raw} from raw: ${raw}`)
  }
}

export class Repository {
  name: string
  owner: string
  constructor() {
    const tmp: string[] = process.env.GITHUB_REPOSITORY?.split('/') ?? []
    this.owner = tmp?.[0] ?? ''
    this.name = tmp?.[1] ?? ''
  }
}

export type SourceType = 'tags' | 'releases'

export async function getOctokitClient(
  githubToken: string
): Promise<InstanceType<typeof GitHub>> {
  return github.getOctokit(githubToken)
}

export async function getVersionsFromTags(
  octokit: InstanceType<typeof GitHub>
): Promise<Version[]> {
  const repo = new Repository()
  const res =
    (await octokit.paginate(`GET /repos/${repo.owner}/${repo.name}/tags`)) ?? []
  return res.map((data: any) => new Version(data.name))
}

export async function getVersionsFromReleases(
  octokit: InstanceType<typeof GitHub>
): Promise<Version[]> {
  const repo = new Repository()
  const res =
    (await octokit.paginate(
      `GET /repos/${repo.owner}/${repo.name}/releases`
    )) ?? []
  return res.map((data: any) => new Version(data.name))
}

export function filterAndSortVersions(
  versions: Version[],
  prefix: string,
  includePrereleases: boolean
): Version[] {
  core.info(`Filtering versions with prefix: ${prefix}`)
  const filteredVersions = versions.filter(version => {
    core.info(`Checking version: ${version.raw}`)
    let check = semver.coerce(version.raw) != null
    if (
      !includePrereleases &&
      (version.semver.build.length || version.semver.prerelease.length)
    ) {
      check = false
    }
    check = check && version.raw.startsWith(prefix)
    if (!check) {
      core.info(`Filtering out ${version.raw}`)
    }
    return check
  })
  core.info(`Filtered versions: ${JSON.stringify(filteredVersions)}`)
  const sortedVersions = filteredVersions.sort((x, y) => {
    return semver.compare(y.semver, x.semver)
  })
  core.info(`Sorted versions: ${JSON.stringify(sortedVersions)}`)
  return sortedVersions
}

export function bumpVersion(
  version: Version,
  incrementLevel: semver.ReleaseType
): Version {
  const tmp = new Version(version.semver.raw)
  return new Version(tmp.semver.inc(incrementLevel).raw)
}

export function getIncrementLevelFromTitle(title: string): semver.ReleaseType {
  if (title.includes('(MAJOR)')) {
    return 'major'
  } else if (title.includes('(MINOR)')) {
    return 'minor'
  } else if (title.includes('(PATCH)')) {
    return 'patch'
  } else {
    return 'patch'
  }
}

export async function run(): Promise<void> {
  try {
    const githubToken: string = core.getInput('token')
    const prefix = core.getInput('prefix')
    const source: SourceType = core.getInput('source') as SourceType
    const includePrereleases: boolean =
      core.getInput('includePrereleases') === 'true'
    const octokit = await getOctokitClient(githubToken)
    core.info('client created')
    let allVersions: Version[] = []
    if (source === 'tags') {
      core.info('coercing with tags')
      allVersions = await getVersionsFromTags(octokit)
    } else if (source === 'releases') {
      core.info('coercing with releases')
      allVersions = await getVersionsFromReleases(octokit)
    } else {
      throw Error(`${source} is not a valid value for "source"`)
    }
    core.info(`filtering and sorting ${allVersions.length} versions`)
    const filteredAndSortedVersions: Version[] = filterAndSortVersions(
      allVersions,
      prefix,
      includePrereleases
    )
    const currentVersion =
      filteredAndSortedVersions?.[0] ?? new Version('0.0.0')
    const title = github.context.payload.head_commit?.message ?? ''
    const incrementLevel = getIncrementLevelFromTitle(title)
    core.info(`${currentVersion.semver.raw} bumping to next version`)
    const nextVersion = bumpVersion(currentVersion, incrementLevel)
    core.setOutput('currentVersion', currentVersion.semver.raw)
    core.setOutput('nextVersion', nextVersion.semver.raw)
    core.info(
      `${currentVersion.semver.raw} bumped to ${nextVersion.semver.raw}`
    )
  } catch (error) {
    if (error instanceof Error) {
      core.info(error.stack ?? error.message)
      core.setFailed(error)
    }
  }
}
