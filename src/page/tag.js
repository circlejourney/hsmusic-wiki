/** @format */

// Art tag page specification.

// Imports

import fixWS from 'fix-whitespace';

// Page exports

export function condition({wikiData}) {
  return wikiData.wikiInfo.enableArtTagUI;
}

export function targets({wikiData}) {
  return wikiData.artTagData.filter((tag) => !tag.isContentWarning);
}

export function write(tag, {wikiData}) {
  const {taggedInThings: things} = tag;

  // Display things featuring this art tag in reverse chronological order,
  // sticking the most recent additions near the top!
  const thingsReversed = things.slice().reverse();

  const entries = thingsReversed.map((item) => ({item}));

  const page = {
    type: 'page',
    path: ['tag', tag.directory],
    page: ({
      getAlbumCover,
      getGridHTML,
      getThemeString,
      getTrackCover,
      link,
      language,
    }) => ({
      title: language.$('tagPage.title', {tag: tag.name}),
      theme: getThemeString(tag.color),

      main: {
        classes: ['top-index'],
        content: fixWS`
                    <h1>${language.$('tagPage.title', {tag: tag.name})}</h1>
                    <p class="quick-info">${language.$('tagPage.infoLine', {
                      coverArts: language.countCoverArts(things.length, {
                        unit: true,
                      }),
                    })}</p>
                    <div class="grid-listing">
                        ${getGridHTML({
                          entries,
                          srcFn: (thing) =>
                            thing.album
                              ? getTrackCover(thing)
                              : getAlbumCover(thing),
                          linkFn: (thing, opts) =>
                            thing.album
                              ? link.track(thing, opts)
                              : link.album(thing, opts),
                        })}
                    </div>
                `,
      },

      nav: generateTagNav(tag, {
        link,
        language,
        wikiData,
      }),
    }),
  };

  return [page];
}

// Utility functions

function generateTagNav(
  tag,
  {link, language, wikiData}
) {
  return {
    linkContainerClasses: ['nav-links-hierarchy'],
    links: [
      {toHome: true},
      wikiData.wikiInfo.enableListings && {
        path: ['localized.listingIndex'],
        title: language.$('listingIndex.title'),
      },
      {
        html: language.$('tagPage.nav.tag', {
          tag: link.tag(tag, {class: 'current'}),
        }),
      },
    ],
  };
}
