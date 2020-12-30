import semver from 'semver';
import chalk from 'chalk';
import boxen from 'boxen';
import PackageManager from './project-package-manager';
import getGlobalInstallCommand from './get-global-install-command';

const pm = new PackageManager();

interface Options {
    commandName: string;
    currentVer: semver.SemVer;
    packageName: string;
}

async function getLatestVersion(
    packageName: string,
    includePrerelease?: boolean
): Promise<semver.SemVer> {
    let version = await pm.getRemoteVersion(packageName, 'latest');

    if (includePrerelease) {
        const next = await pm.getRemoteVersion(packageName, 'next');
        version = semver.gt(next as semver.SemVer, version as semver.SemVer)
            ? next
            : version;
    }

    return version as semver.SemVer;
}

export default async function generateTitle({
    commandName,
    currentVer,
    packageName,
}: Options): Promise<string> {
    const includePrerelease = !!semver.prerelease(currentVer);
    const latestVer = await getLatestVersion(packageName, includePrerelease);
    let title = chalk.bold.blue(`${commandName} CLI v${currentVer}`);

    if (semver.gt(latestVer, currentVer)) {
        let upgradeMessage = `New version available ${chalk.magenta(
            currentVer
        )} → ${chalk.green(latestVer)}`;

        try {
            const command = getGlobalInstallCommand();
            if (semver.prerelease(latestVer)) {
                packageName += '@next';
            }

            if (command) {
                upgradeMessage += `\nRun ${chalk.yellow(
                    `${command} ${packageName}`
                )} to update!`;
            }
        }
        catch (e) {}

        const upgradeBox = boxen(upgradeMessage, {
            align: 'center',
            borderColor: 'green',
            dimBorder: true,
            padding: 1,
        });

        title += `\n${upgradeBox}\n`;
    }

    return title;
}
