import {
    logError,
    logWarn
} from './cli.js';

function findHelper(keys, dataProp, findFns = {}) {
    // Note: This cache explicitly *doesn't* support mutable data arrays. If the
    // data array is modified, make sure it's actually a new array object, not
    // the original, or the cache here will break and act as though the data
    // hasn't changed!
    const cache = new WeakMap();

    const byDirectory = findFns.byDirectory || matchDirectory;
    const byName = findFns.byName || matchName;

    const keyRefRegex = new RegExp(String.raw`^(?:(${keys.join('|')}):(?=\S))?(.*)$`);

    return (fullRef, {wikiData, quiet = false}) => {
        if (!fullRef) return null;
        if (typeof fullRef !== 'string') {
            throw new Error(`Got a reference that is ${typeof fullRef}, not string: ${fullRef}`);
        }

        const data = wikiData[dataProp];

        if (!data) {
            throw new Error(`Expected data to be present`);
        }

        let cacheForThisData = cache.get(data);
        const cachedValue = cacheForThisData?.[fullRef];
        if (cachedValue) {
            globalThis.NUM_CACHE = (globalThis.NUM_CACHE || 0) + 1;
            return cachedValue;
        }
        if (!cacheForThisData) {
            cacheForThisData = Object.create(null);
            cache.set(data, cacheForThisData);
        }

        const match = fullRef.match(keyRefRegex);
        if (!match) {
            throw new Error(`Malformed link reference: "${fullRef}"`);
        }

        const key = match[1];
        const ref = match[2];

        const found = (key
            ? byDirectory(ref, data, quiet)
            : byName(ref, data, quiet));

        if (!found && !quiet) {
            logWarn`Didn't match anything for ${fullRef}!`;
        }

        cacheForThisData[fullRef] = found;

        return found;
    };
}

function matchDirectory(ref, data, quiet) {
    return data.find(({ directory }) => directory === ref);
}

function matchName(ref, data, quiet) {
    const matches = data.filter(({ name }) => name.toLowerCase() === ref.toLowerCase());

    if (matches.length > 1) {
        // TODO: This should definitely be a thrown error.
        if (!quiet) {
            logError`Multiple matches for reference "${ref}". Please resolve:`;
            for (const match of matches) {
                logError`- ${match.name} (${match.directory})`;
            }
            logError`Returning null for this reference.`;
        }
        return null;
    }

    if (matches.length === 0) {
        return null;
    }

    const thing = matches[0];

    if (ref !== thing.name && !quiet) {
        logWarn`Bad capitalization: ${'\x1b[31m' + ref} -> ${'\x1b[32m' + thing.name}`;
    }

    return thing;
}

function matchTagName(ref, data, quiet) {
    return matchName(ref.startsWith('cw: ') ? ref.slice(4) : ref, data, quiet);
}

const find = {
    album: findHelper(['album', 'album-commentary'], 'albumData'),
    artist: findHelper(['artist', 'artist-gallery'], 'artistData'),
    artTag: findHelper(['tag'], 'artTagData', {byName: matchTagName}),
    flash: findHelper(['flash'], 'flashData'),
    group: findHelper(['group', 'group-gallery'], 'groupData'),
    listing: findHelper(['listing'], 'listingSpec'),
    newsEntry: findHelper(['news-entry'], 'newsData'),
    staticPage: findHelper(['static'], 'staticPageData'),
    track: findHelper(['track'], 'trackData')
};

export default find;
