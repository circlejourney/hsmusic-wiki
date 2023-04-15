import {empty} from '../../util/sugar.js';

export default {
  contentDependencies: ['image', 'linkArtTag'],
  extraDependencies: ['html', 'language'],

  relations(relation, artTags) {
    const relations = {};

    relations.image =
      relation('image', artTags);

    if (artTags) {
      relations.tagLinks =
        artTags
          .filter(tag => !tag.isContentWarning)
          .map(tag => relation('linkArtTag', tag));
    } else {
      relations.tagLinks = null;
    }

    return relations;
  },

  generate(relations, {html, language}) {
    return html.template({
      annotation: 'generateCoverArtwork',

      slots: {
        path: {
          validate: v => v.validateArrayItems(v.isString),
        },

        alt: {
          type: 'string',
        },

        displayMode: {
          validate: v => v.is('primary', 'thumbnail'),
          default: 'primary',
        },
      },

      content(slots) {
        switch (slots.displayMode) {
          case 'primary':
            return html.tag('div', {id: 'cover-art-container'}, [
              relations.image
                .slots({
                  path: slots.path,
                  alt: slots.alt,
                  thumb: 'medium',
                  id: 'cover-art',
                  link: true,
                  square: true,
                }),

              !empty(relations.tagLinks) &&
                html.tag('p',
                  language.$('releaseInfo.artTags.inline', {
                    tags: language.formatUnitList(relations.tagLinks),
                  })),
              ]);

          case 'thumbnail':
            return relations.image
              .slots({
                path: slots.path,
                alt: slots.alt,
                thumb: 'small',
                link: false,
                square: true,
              });

          case 'default':
            return html.blank();
        }
      },
    });
  },
};
