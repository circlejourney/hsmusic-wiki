import t from 'tap';

import {linkAndBindWikiData} from '#test-lib';
import thingConstructors from '#things';

const {
  Album,
  Artist,
  Track,
} = thingConstructors;

function stubArtistAndContribs() {
  const artist = new Artist();
  artist.name = `Test Artist`;

  const contribs = [{who: `Test Artist`, what: null}];
  const badContribs = [{who: `Figment of Your Imagination`, what: null}];

  return {artist, contribs, badContribs};
}

function stubTrack(directory = 'foo') {
  const track = new Track();
  track.directory = directory;

  return track;
}

t.test(`Album.coverArtDate`, t => {
  t.plan(6);

  const album = new Album();
  const {artist, contribs, badContribs} = stubArtistAndContribs();

  linkAndBindWikiData({
    albumData: [album],
    artistData: [artist],
  });

  t.equal(album.coverArtDate, null,
    `Album.coverArtDate #1: defaults to null`);

  album.date = new Date('2012-10-25');

  t.equal(album.coverArtDate, null,
    `Album.coverArtDate #2: is null if coverArtistContribs empty (1/2)`);

  album.coverArtDate = new Date('2011-04-13');

  t.equal(album.coverArtDate, null,
    `Album.coverArtDate #3: is null if coverArtistContribs empty (2/2)`);

  album.coverArtistContribs = contribs;

  t.same(album.coverArtDate, new Date('2011-04-13'),
    `Album.coverArtDate #4: is own value`);

  album.coverArtDate = null;

  t.same(album.coverArtDate, new Date(`2012-10-25`),
    `Album.coverArtDate #5: inherits album release date`);

  album.coverArtistContribs = badContribs;

  t.equal(album.coverArtDate, null,
    `Album.coverArtDate #6: is null if coverArtistContribs resolves empty`);
});

t.test(`Album.coverArtFileExtension`, t => {
  t.plan(5);

  const album = new Album();
  const {artist, contribs, badContribs} = stubArtistAndContribs();

  linkAndBindWikiData({
    albumData: [album],
    artistData: [artist],
  });

  t.equal(album.coverArtFileExtension, null,
    `Album.coverArtFileExtension #1: is null if coverArtistContribs empty (1/2)`);

  album.coverArtFileExtension = 'png';

  t.equal(album.coverArtFileExtension, null,
    `Album.coverArtFileExtension #2: is null if coverArtistContribs empty (2/2)`);

  album.coverArtFileExtension = null;
  album.coverArtistContribs = contribs;

  t.equal(album.coverArtFileExtension, 'jpg',
    `Album.coverArtFileExtension #3: defaults to jpg`);

  album.coverArtFileExtension = 'png';

  t.equal(album.coverArtFileExtension, 'png',
    `Album.coverArtFileExtension #4: is own value`);

  album.coverArtistContribs = badContribs;

  t.equal(album.coverArtFileExtension, null,
    `Album.coverArtFileExtension #5: is null if coverArtistContribs resolves empty`);
});

t.test(`Album.tracks`, t => {
  t.plan(4);

  const album = new Album();
  const track1 = stubTrack('track1');
  const track2 = stubTrack('track2');
  const track3 = stubTrack('track3');

  linkAndBindWikiData({
    albumData: [album],
    trackData: [track1, track2, track3],
  });

  t.same(album.tracks, [],
    `Album.tracks #1: defaults to empty array`);

  album.trackSections = [
    {tracks: ['track:track1', 'track:track2', 'track:track3']},
  ];

  t.same(album.tracks, [track1, track2, track3],
    `Album.tracks #2: pulls tracks from one track section`);

  album.trackSections = [
    {tracks: ['track:track1']},
    {tracks: ['track:track2', 'track:track3']},
  ];

  t.same(album.tracks, [track1, track2, track3],
    `Album.tracks #3: pulls tracks from multiple track sections`);

  album.trackSections = [
    {tracks: ['track:track1', 'track:does-not-exist']},
    {tracks: ['track:this-one-neither', 'track:track2']},
    {tracks: ['track:effectively-empty-section']},
    {tracks: ['track:track3']},
  ];

  t.same(album.tracks, [track1, track2, track3],
    `Album.tracks #4: filters out references without matches`);
});

t.test(`Album.trackSections`, t => {
  t.plan(5);

  const album = new Album();
  const track1 = stubTrack('track1');
  const track2 = stubTrack('track2');
  const track3 = stubTrack('track3');
  const track4 = stubTrack('track4');

  linkAndBindWikiData({
    albumData: [album],
    trackData: [track1, track2, track3, track4],
  });

  album.trackSections = [
    {tracks: ['track:track1', 'track:track2']},
    {tracks: ['track:track3', 'track:track4']},
  ];

  t.match(album.trackSections, [
    {tracks: [track1, track2]},
    {tracks: [track3, track4]},
  ], `Album.trackSections #1: exposes tracks`);

  t.match(album.trackSections, [
    {tracks: [track1, track2], startIndex: 0},
    {tracks: [track3, track4], startIndex: 2},
  ], `Album.trackSections #2: exposes startIndex`);

  album.color = '#123456';

  album.trackSections = [
    {tracks: ['track:track1'], color: null},
    {tracks: ['track:track2'], color: '#abcdef'},
    {tracks: ['track:track3'], color: null},
  ];

  t.match(album.trackSections, [
    {tracks: [track1], color: '#123456'},
    {tracks: [track2], color: '#abcdef'},
    {tracks: [track3], color: '#123456'},
  ], `Album.trackSections #3: exposes color, inherited from album`);

  album.trackSections = [
    {tracks: ['track:track1'], dateOriginallyReleased: null},
    {tracks: ['track:track2'], dateOriginallyReleased: new Date('2009-04-11')},
    {tracks: ['track:track3'], dateOriginallyReleased: null},
  ];

  t.match(album.trackSections, [
    {tracks: [track1], dateOriginallyReleased: null},
    {tracks: [track2], dateOriginallyReleased: new Date('2009-04-11')},
    {tracks: [track3], dateOriginallyReleased: null},
  ], `Album.trackSections #4: exposes dateOriginallyReleased, if present`);

  album.trackSections = [
    {tracks: ['track:track1'], isDefaultTrackSection: true},
    {tracks: ['track:track2'], isDefaultTrackSection: false},
    {tracks: ['track:track3'], isDefaultTrackSection: null},
  ];

  t.match(album.trackSections, [
    {tracks: [track1], isDefaultTrackSection: true},
    {tracks: [track2], isDefaultTrackSection: false},
    {tracks: [track3], isDefaultTrackSection: false},
  ], `Album.trackSections #5: exposes isDefaultTrackSection, defaults to false`);
});
