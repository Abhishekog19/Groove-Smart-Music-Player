/**
 * SearchInterface Component - React Implementation
 * JavaScript/JSX version without TypeScript
 * 
 * Features:
 * - Search for tracks, albums, artists, playlists
 * - Direct play/download from search results
 * - URL detection and import (Tidal, Spotify)
 * - Spotify playlist conversion
 * - Album download with progress
 * - Queue management
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  Search,
  ChevronDown,
  Music,
  User,
  Disc,
  Download,
  Newspaper,
  ListPlus,
  ListVideo,
  LoaderCircle,
  X,
  Earth,
  Ban,
  Link2,
  MoreVertical,
  List,
  Play,
  Shuffle,
  Copy,
  Code,
} from 'lucide-react';

import {
  useSearchStore,
  usePlayer,
  useDownloads,
  useOutsideClick,
  useUserPreferences,
  useRegion,
} from '../hooks/hooks.js';

import {
  formatArtists,
  formatDuration,
  formatQualityLabel,
  getLongLink,
  getShortLink,
  getEmbedCode,
  copyToClipboard,
  getTrackFilename,
  getTrackArtist,
  getExtensionForQuality,
  fetchWithRetry,
} from '../utils/utils.js';

import {
  isSonglinkTrack,
  asTrack,
} from '../types/types.js';

import styles from './SearchInterface.module.css';

// NEWS ITEMS
const NEWS_ITEMS = [
  {
    title: 'Hi-Res downloading!!!',
    description:
      "You can finally download and stream in Hi-Res again because of a much better API. It should also be much faster - try it out for yourself!",
  },
  {
    title: 'Links support + QOLs!',
    description:
      "You can now paste links from supported streaming platforms (Spotify, YouTube, Apple Music, etc.) and the app will try to convert them to TIDAL equivalents for you to play or download.",
  },
  {
    title: 'Redesign + QQDL',
    description:
      'Hi-Res downloading still a WIP but a cool redesign that inspired off a very cool library called Color Thief!',
  },
  {
    title: 'Hi-Res Audio',
    description:
      "Streaming for Hi-Res is now here. Stay tuned for Hi-Res downloading. And video covers too!",
  },
  {
    title: 'Even more changes!',
    description:
      "LYRICS!!! Stabilised the API and added features such as ZIP download of albums, better error handling, etc.",
  },
  {
    title: 'QOL changes',
    description:
      'Queue management and album/artist pages have been added along with bug squashing and QOL improvements.',
  },
  {
    title: 'Initial release!',
    description:
      "Download lossless CD-quality 16/44.1kHz FLAC. No Hi-Res yet but working on it!",
  },
];

const REGION_AVAILABILITY = {
  auto: true,
  us: true,
  eu: true,
};

const TRACK_SKELETONS = Array.from({ length: 6 }, (_, i) => i);
const GRID_SKELETONS = Array.from({ length: 8 }, (_, i) => i);

/**
 * SearchInterface Component
 */
export function SearchInterface({ onTrackSelect, apiClient }) {
  // State hooks
  const search = useSearchStore();
  const player = usePlayer();
  const downloads = useDownloads();
  const prefs = useUserPreferences();
  const region = useRegion(REGION_AVAILABILITY);

  // Local state
  const [activeMenuId, setActiveMenuId] = useState(null);
  const menuRef = useOutsideClick(() => setActiveMenuId(null));

  // Computed values
  const isQueryATidalUrl = useMemo(
    () => search.query.trim().length > 0 && apiClient.isTidalUrl?.(search.query.trim()),
    [search.query, apiClient]
  );

  const isQueryASpotifyPlaylist = useMemo(
    () => search.query.trim().length > 0 && apiClient.isSpotifyPlaylistUrl?.(search.query.trim()),
    [search.query, apiClient]
  );

  const isQueryAStreamingUrl = useMemo(
    () => search.query.trim().length > 0 && apiClient.isSupportedStreamingUrl?.(search.query.trim()),
    [search.query, apiClient]
  );

  const isQueryAUrl = useMemo(
    () => isQueryATidalUrl || isQueryAStreamingUrl,
    [isQueryATidalUrl, isQueryAStreamingUrl]
  );

  // Event handlers
  const handleSearch = useCallback(async () => {
    if (!search.query.trim()) return;

    if (isQueryATidalUrl) {
      await handleUrlImport();
      return;
    }

    if (isQueryASpotifyPlaylist) {
      await handleSpotifyPlaylistConversion();
      return;
    }

    if (isQueryAStreamingUrl) {
      await handleStreamingUrlConversion();
      return;
    }

    search.setIsLoading(true);
    search.setError(null);

    try {
      let data;

      switch (search.activeTab) {
        case 'tracks':
          data = await fetchWithRetry(() =>
            apiClient.searchTracks(search.query, region.selectedRegion)
          );
          search.setTracks(Array.isArray(data?.items) ? data.items : []);
          break;

        case 'albums':
          data = await apiClient.searchAlbums(search.query, region.selectedRegion);
          search.setAlbums(Array.isArray(data?.items) ? data.items : []);
          break;

        case 'artists':
          data = await apiClient.searchArtists(search.query, region.selectedRegion);
          search.setArtists(Array.isArray(data?.items) ? data.items : []);
          break;

        case 'playlists':
          data = await apiClient.searchPlaylists(search.query, region.selectedRegion);
          search.setPlaylists(Array.isArray(data?.items) ? data.items : []);
          break;
      }
    } catch (err) {
      search.setError(err instanceof Error ? err.message : 'Search failed');
      console.error('Search error:', err);
    } finally {
      search.setIsLoading(false);
    }
  }, [search, region.selectedRegion, isQueryATidalUrl, isQueryASpotifyPlaylist, isQueryAStreamingUrl, apiClient]);

  const handleUrlImport = useCallback(async () => {
    if (!search.query.trim()) return;

    search.setIsLoading(true);
    search.setError(null);

    try {
      const result = await apiClient.importFromUrl(search.query);
      search.clearResults();

      switch (result.type) {
        case 'track':
          search.setTracks([result.data]);
          search.setActiveTab('tracks');
          break;
        case 'album':
          search.setAlbums([result.data]);
          search.setActiveTab('albums');
          break;
        case 'artist':
          search.setArtists([result.data]);
          search.setActiveTab('artists');
          break;
        case 'playlist':
          search.setPlaylists([result.data.playlist]);
          search.setTracks(result.data.tracks);
          search.setActiveTab('playlists');
          break;
      }
    } catch (err) {
      search.setError(err instanceof Error ? err.message : 'Failed to import from URL');
      console.error('URL import error:', err);
    } finally {
      search.setIsLoading(false);
    }
  }, [search, apiClient]);

  const handleStreamingUrlConversion = useCallback(async () => {
    if (!search.query.trim()) return;

    search.setIsLoading(true);
    search.setError(null);

    try {
      const platformName = apiClient.getPlatformName?.(search.query.trim());
      console.log(`Converting ${platformName || 'streaming'} URL to TIDAL...`);

      const tidalInfo = await apiClient.convertToTidal(search.query.trim(), {
        userCountry: 'US',
        songIfSingle: true,
      });

      if (!tidalInfo) {
        search.setError(
          `Could not find TIDAL equivalent for this ${platformName || 'streaming platform'} link.`
        );
        search.setIsLoading(false);
        return;
      }

      switch (tidalInfo.type) {
        case 'track': {
          const trackLookup = await apiClient.getTrack(Number(tidalInfo.id));
          if (trackLookup?.track) {
            player.setTrack(trackLookup.track);
            search.setQuery('');
          }
          break;
        }
        case 'album': {
          const albumData = await apiClient.getAlbum(Number(tidalInfo.id));
          if (albumData?.album) {
            search.setActiveTab('albums');
            search.setAlbums([albumData.album]);
            search.setQuery('');
          }
          break;
        }
        case 'playlist': {
          const playlistData = await apiClient.getPlaylist(tidalInfo.id);
          if (playlistData?.playlist) {
            search.setActiveTab('playlists');
            search.setPlaylists([playlistData.playlist]);
            search.setQuery('');
          }
          break;
        }
      }
    } catch (err) {
      search.setError(err instanceof Error ? err.message : 'Failed to convert URL');
      console.error('Streaming URL conversion error:', err);
    } finally {
      search.setIsLoading(false);
    }
  }, [search, player, apiClient]);

  const handleSpotifyPlaylistConversion = useCallback(async () => {
    if (!search.query.trim()) return;

    search.setError(null);
    search.setPlaylistLoadingMessage('Loading playlist...');
    search.setIsPlaylistConversionMode(true);
    search.setIsLoading(true);

    try {
      console.log('Fetching Spotify playlist tracks...');
      const spotifyTrackUrls = await apiClient.convertSpotifyPlaylist(search.query.trim());

      if (!spotifyTrackUrls || spotifyTrackUrls.length === 0) {
        search.setError('Could not fetch tracks from Spotify playlist.');
        search.setPlaylistLoadingMessage(null);
        search.setIsLoading(false);
        search.setIsPlaylistConversionMode(false);
        return;
      }

      console.log(`Found ${spotifyTrackUrls.length} tracks`);
      search.setPlaylistConversionTotal(spotifyTrackUrls.length);
      search.setPlaylistLoadingMessage(`Loading ${spotifyTrackUrls.length} tracks...`);
      search.setActiveTab('tracks');
      search.setTracks([]);
      search.setIsLoading(false);

      const conversionPromises = spotifyTrackUrls.map(async (trackUrl, index) => {
        try {
          const songlinkData = await apiClient.fetchSonglinkData(trackUrl, {
            userCountry: 'US',
            songIfSingle: true,
          });

          const tidalEntity = apiClient.extractTidalSongEntity(songlinkData);

          if (tidalEntity) {
            const songlinkTrack = {
              id: songlinkData.entityUniqueId,
              title: tidalEntity.title || 'Unknown Track',
              artistName: tidalEntity.artistName || 'Unknown Artist',
              duration: 180,
              thumbnailUrl: tidalEntity.thumbnailUrl || '',
              sourceUrl: trackUrl,
              songlinkData,
              isSonglinkTrack: true,
              tidalId: tidalEntity.id ? Number(tidalEntity.id) : undefined,
              audioQuality: 'LOSSLESS',
            };

            return { success: true, track: songlinkTrack };
          }

          return { success: false };
        } catch (err) {
          console.warn(`Failed to fetch Songlink data for track ${index + 1}:`, err);
          return { success: false };
        }
      });

      const results = await Promise.allSettled(conversionPromises);
      const successfulTracks = [];

      results.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value.success) {
          successfulTracks.push(result.value.track);
        }
        search.setPlaylistLoadingMessage(`Loaded ${index + 1}/${spotifyTrackUrls.length} tracks...`);
      });

      search.setTracks(successfulTracks);
      search.setQuery('');

      setTimeout(() => {
        search.setPlaylistLoadingMessage(null);
      }, 3000);
    } catch (err) {
      search.setError(err instanceof Error ? err.message : 'Failed to load Spotify playlist');
      console.error('Spotify playlist error:', err);
      search.setPlaylistLoadingMessage(null);
      search.setIsPlaylistConversionMode(false);
    }
  }, [search, apiClient]);

  const handleDownload = useCallback(
    async (track, event) => {
      if (event) {
        event.stopPropagation();
      }

      let trackId;
      let artistName;

      if (isSonglinkTrack(track)) {
        if (!track.tidalId) {
          alert('This track needs to be played first before downloading.');
          return;
        }
        trackId = track.tidalId;
        artistName = track.artistName;
      } else {
        trackId = track.id;
        artistName = formatArtists(asTrack(track).artists);
      }

      if (!Number.isFinite(trackId) || trackId <= 0) {
        alert('Cannot download this track - invalid track ID');
        return;
      }

      const downloadTask = downloads.startDownload(
        track,
        getTrackFilename(track, prefs.downloadQuality, prefs.convertAacToMp3)
      );

      try {
        await apiClient.downloadTrack(trackId, prefs.downloadQuality, downloadTask.filename, {
          signal: downloadTask.controller.signal,
          onProgress: (progress) => {
            downloads.updateProgress(downloadTask.id, progress.receivedBytes, progress.totalBytes);
          },
          convertAacToMp3: prefs.convertAacToMp3,
          downloadCoverSeperately: prefs.downloadCoversSeperately,
        });

        downloads.completeDownload(downloadTask.id);
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          downloads.completeDownload(downloadTask.id);
        } else {
          const message = error instanceof Error ? error.message : 'Download failed';
          downloads.errorDownload(downloadTask.id, message);
          alert(message);
        }
      }
    },
    [downloads, prefs, apiClient]
  );

  const handleAlbumDownload = useCallback(
    async (album, event) => {
      event.preventDefault();
      event.stopPropagation();

      if (downloads.albumStates[album.id]?.downloading) {
        return;
      }

      downloads.updateAlbumState(album.id, {
        downloading: true,
        completed: 0,
        total: album.numberOfTracks ?? 0,
        error: null,
      });

      try {
        await apiClient.downloadAlbum(album, prefs.downloadQuality, {
          onTotalResolved: (total) => {
            downloads.updateAlbumState(album.id, { total });
          },
          onTrackDownloaded: (completed, total) => {
            downloads.updateAlbumState(album.id, { completed, total });
          },
        });

        downloads.updateAlbumState(album.id, { downloading: false });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Album download failed';
        downloads.updateAlbumState(album.id, { downloading: false, error: message });
      }
    },
    [downloads, prefs, apiClient]
  );

  const handleTrackActivation = useCallback(
    (track) => {
      onTrackSelect?.(track);
      player.setTrack(track);
    },
    [onTrackSelect, player]
  );

  const handlePlayAll = useCallback(() => {
    if (search.tracks.length > 0) {
      player.setQueue(search.tracks, 0);
    }
  }, [search.tracks, player]);

  const handleShuffleAll = useCallback(() => {
    if (search.tracks.length > 0) {
      const shuffled = [...search.tracks].sort(() => Math.random() - 0.5);
      player.setQueue(shuffled, 0);
    }
  }, [search.tracks, player]);

  const handleDownloadAll = useCallback(async () => {
    if (search.tracks.length === 0) return;

    for (const track of search.tracks) {
      try {
        await handleDownload(track);
      } catch (err) {
        console.error(`Failed to download ${track.title}:`, err);
      }
    }
  }, [search.tracks, handleDownload]);

  const handleKeyPress = useCallback(
    (event) => {
      if (event.key === 'Enter') {
        handleSearch();
      }
    },
    [handleSearch]
  );

  const handleTabChange = useCallback(
    (tab) => {
      search.setActiveTab(tab);
      if (search.query.trim() && !isQueryAUrl) {
        handleSearch();
      }
    },
    [search, isQueryAUrl, handleSearch]
  );

  const handleShare = useCallback(async (track, type) => {
    let text = '';
    switch (type) {
      case 'long':
        text = getLongLink('track', track.id);
        break;
      case 'short':
        text = getShortLink('track', track.id);
        break;
      case 'embed':
        text = getEmbedCode('track', track.id);
        break;
    }
    await copyToClipboard(text);
  }, []);

  return (
    <div className={styles.container}>
      {/* Search Input */}
      <div className={styles.searchSection}>
        <div className={styles.searchBox}>
          <div className={styles.inputWrapper}>
            <input
              type="text"
              value={search.query}
              onChange={(e) => search.setQuery(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={
                isQueryATidalUrl
                  ? 'Tidal URL detected - press Enter to import'
                  : isQueryASpotifyPlaylist
                    ? 'Spotify playlist detected - press Enter to convert'
                    : isQueryAStreamingUrl
                      ? `${apiClient.getPlatformName?.(search.query)} URL detected`
                      : 'Search for tracks, albums, artists... or paste a URL'
              }
              className={styles.input}
            />
          </div>

          <button
            onClick={handleSearch}
            disabled={search.isLoading || !search.query.trim()}
            className={styles.searchButton}
          >
            {isQueryASpotifyPlaylist ? (
              <>
                <Link2 size={16} />
                <span className={styles.buttonLabel}>
                  {search.isLoading ? 'Converting…' : 'Convert Playlist'}
                </span>
              </>
            ) : isQueryAStreamingUrl ? (
              <>
                <Link2 size={16} />
                <span className={styles.buttonLabel}>
                  {search.isLoading ? 'Converting…' : 'Convert & Play'}
                </span>
              </>
            ) : isQueryATidalUrl ? (
              <>
                <Link2 size={16} />
                <span className={styles.buttonLabel}>
                  {search.isLoading ? 'Importing…' : 'Import'}
                </span>
              </>
            ) : (
              <>
                <Search size={16} />
                <span className={styles.buttonLabel}>
                  {search.isLoading ? 'Searching…' : 'Search'}
                </span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Tabs */}
      {!isQueryAUrl && (
        <div className={styles.tabs}>
          {['tracks', 'albums', 'artists', 'playlists'].map(tab => (
            <button
              key={tab}
              onClick={() => handleTabChange(tab)}
              className={`${styles.tab} ${search.activeTab === tab ? styles.activeTab : ''}`}
            >
              {tab === 'tracks' && <Music size={18} />}
              {tab === 'albums' && <Disc size={18} />}
              {tab === 'artists' && <User size={18} />}
              {tab === 'playlists' && <List size={18} />}
              <span>{tab.charAt(0).toUpperCase() + tab.slice(1)}</span>
            </button>
          ))}
        </div>
      )}

      {/* Loading State */}
      {search.isLoading && <LoadingState activeTab={search.activeTab} />}

      {/* Error State */}
      {search.error && (
        <div className={styles.error}>
          {search.error}
        </div>
      )}

      {/* Playlist Loading Progress */}
      {search.playlistLoadingMessage && (
        <div className={styles.loadingMessage}>
          <LoaderCircle size={20} className={styles.spinner} />
          <span>{search.playlistLoadingMessage}</span>
        </div>
      )}

      {/* Results */}
      {!search.isLoading && !search.error && (
        <div className={styles.results}>
          {search.activeTab === 'tracks' && search.tracks.length > 0 && (
            <>
              {search.isPlaylistConversionMode && (
                <div className={styles.playlistControls}>
                  <button onClick={handlePlayAll} className={styles.playAllBtn}>
                    <Play size={20} fill="currentColor" />
                    Play All
                  </button>
                  <button onClick={handleShuffleAll} className={styles.shuffleBtn}>
                    <Shuffle size={20} />
                    Shuffle All
                  </button>
                  <button onClick={handleDownloadAll} className={styles.downloadAllBtn}>
                    <Download size={20} />
                    Download All
                  </button>
                  <div className={styles.trackCount}>
                    {search.tracks.length} of {search.playlistConversionTotal} tracks
                  </div>
                </div>
              )}
              <div className={styles.trackList}>
                {search.tracks.map(track => (
                  <TrackRow
                    key={track.id}
                    track={track}
                    isDownloading={downloads.downloadingIds.has(track.id)}
                    isCancelled={downloads.cancelledIds.has(track.id)}
                    activeMenuId={activeMenuId}
                    menuRef={menuRef}
                    onActivate={() => handleTrackActivation(track)}
                    onDownload={(e) => handleDownload(track, e)}
                    onAddToQueue={() => player.enqueue(track)}
                    onPlayNext={() => player.enqueueNext(track)}
                    onMenuToggle={(id) => setActiveMenuId(activeMenuId === id ? null : id)}
                    onShare={(type) => handleShare(track, type)}
                    apiClient={apiClient}
                  />
                ))}
              </div>
            </>
          )}

          {search.activeTab === 'albums' && (
            <div className={styles.albumGrid}>
              {search.albums.map(album => (
                <AlbumCard
                  key={album.id}
                  album={album}
                  imageUrl={apiClient.getCoverUrl?.(album.cover, '640')}
                  isDownloading={downloads.albumStates[album.id]?.downloading || false}
                  downloadState={downloads.albumStates[album.id]}
                  onDownload={(e) => handleAlbumDownload(album, e)}
                />
              ))}
            </div>
          )}

          {search.activeTab === 'artists' && (
            <div className={styles.artistGrid}>
              {search.artists.map(artist => (
                <ArtistCard
                  key={artist.id}
                  artist={artist}
                  imageUrl={apiClient.getArtistPictureUrl?.(artist.picture)}
                />
              ))}
            </div>
          )}

          {search.activeTab === 'playlists' && (
            <div className={styles.playlistGrid}>
              {search.playlists.map(playlist => (
                <PlaylistCard
                  key={playlist.uuid}
                  playlist={playlist}
                  imageUrl={apiClient.getCoverUrl?.(playlist.squareImage || playlist.image, '640')}
                />
              ))}
            </div>
          )}

          {/* News Section */}
          {!search.query.trim() && (
            <NewsSection items={NEWS_ITEMS} />
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function TrackRow({
  track,
  isDownloading,
  isCancelled,
  activeMenuId,
  menuRef,
  onActivate,
  onDownload,
  onAddToQueue,
  onPlayNext,
  onMenuToggle,
  onShare,
  apiClient,
}) {
  const imageUrl = isSonglinkTrack(track)
    ? track.thumbnailUrl
    : apiClient.getCoverUrl?.(asTrack(track).album.cover, '160');

  return (
    <div
      className={styles.trackRow}
      role="button"
      tabIndex={0}
      onClick={onActivate}
    >
      {imageUrl && (
        <img src={imageUrl} alt={track.title} className={styles.trackImage} />
      )}

      <div className={styles.trackInfo}>
        <h3 className={styles.trackTitle}>{track.title}</h3>
        <p className={styles.trackArtist}>
          {isSonglinkTrack(track) ? track.artistName : formatArtists(asTrack(track).artists)}
        </p>
        <p className={styles.trackQuality}>
          {formatQualityLabel(track.audioQuality)}
        </p>
      </div>

      <div className={styles.trackActions} ref={menuRef}>
        <button
          onClick={onDownload}
          className={styles.downloadBtn}
          title={isDownloading ? 'Cancel download' : 'Download track'}
        >
          {isDownloading ? (
            <LoaderCircle size={18} className={styles.spinner} />
          ) : isCancelled ? (
            <X size={18} />
          ) : (
            <Download size={18} />
          )}
        </button>

        <div className={styles.menuContainer}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onMenuToggle(track.id);
            }}
            className={styles.menuBtn}
            title="More options"
          >
            <MoreVertical size={18} />
          </button>

          {activeMenuId === track.id && (
            <div className={styles.dropdown}>
              <button
                onClick={(e) => { e.stopPropagation(); onPlayNext(); onMenuToggle(track.id); }}
                className={styles.dropdownItem}
              >
                <ListVideo size={16} />
                Play Next
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onAddToQueue(); onMenuToggle(track.id); }}
                className={styles.dropdownItem}
              >
                <ListPlus size={16} />
                Add to Queue
              </button>
              <div className={styles.divider} />
              <button
                onClick={(e) => { e.stopPropagation(); onShare('long'); onMenuToggle(track.id); }}
                className={styles.dropdownItem}
              >
                <Link2 size={16} />
                Share Link
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onShare('short'); onMenuToggle(track.id); }}
                className={styles.dropdownItem}
              >
                <Copy size={16} />
                Share Short Link
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onShare('embed'); onMenuToggle(track.id); }}
                className={styles.dropdownItem}
              >
                <Code size={16} />
                Copy Embed Code
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AlbumCard({
  album,
  imageUrl,
  isDownloading,
  downloadState,
  onDownload,
}) {
  return (
    <div className={styles.albumCard}>
      <button
        onClick={onDownload}
        disabled={isDownloading}
        className={styles.albumDownloadBtn}
        title={`Download ${album.title}`}
      >
        {isDownloading ? (
          <LoaderCircle size={16} className={styles.spinner} />
        ) : (
          <Download size={16} />
        )}
      </button>

      <div className={styles.albumImageContainer}>
        {imageUrl && (
          <img src={imageUrl} alt={album.title} className={styles.albumImage} />
        )}
      </div>

      <h3 className={styles.albumTitle}>{album.title}</h3>
      {album.artist && <p className={styles.albumArtist}>{album.artist.name}</p>}
      {album.releaseDate && (
        <p className={styles.albumYear}>{album.releaseDate.split('-')[0]}</p>
      )}

      {isDownloading && downloadState && (
        <p className={styles.downloadProgress}>
          Downloading {downloadState.completed}/{downloadState.total} tracks…
        </p>
      )}
      {downloadState?.error && (
        <p className={styles.downloadError}>{downloadState.error}</p>
      )}
    </div>
  );
}

function ArtistCard({ artist, imageUrl }) {
  return (
    <div className={styles.artistCard}>
      <div className={styles.artistImageContainer}>
        {imageUrl ? (
          <img src={imageUrl} alt={artist.name} className={styles.artistImage} />
        ) : (
          <User size={48} className={styles.artistPlaceholder} />
        )}
      </div>
      <h3 className={styles.artistName}>{artist.name}</h3>
      <p className={styles.artistLabel}>Artist</p>
    </div>
  );
}

function PlaylistCard({ playlist, imageUrl }) {
  return (
    <div className={styles.playlistCard}>
      <div className={styles.playlistImageContainer}>
        {imageUrl && (
          <img src={imageUrl} alt={playlist.title} className={styles.playlistImage} />
        )}
      </div>
      <h3 className={styles.playlistTitle}>{playlist.title}</h3>
      <p className={styles.playlistCreator}>{playlist.creator.name}</p>
      <p className={styles.trackCount}>{playlist.numberOfTracks} tracks</p>
    </div>
  );
}

function LoadingState({ activeTab }) {
  if (activeTab === 'tracks') {
    return (
      <div className={styles.loadingTracks}>
        {TRACK_SKELETONS.map(i => (
          <div key={i} className={styles.skeletonTrack}>
            <div className={styles.skeletonImage} />
            <div className={styles.skeletonContent}>
              <div className={styles.skeletonLine} />
              <div className={styles.skeletonLine} style={{ width: '60%' }} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={`${styles.grid} ${styles.loadingGrid}`}>
      {GRID_SKELETONS.map(i => (
        <div key={i} className={styles.skeletonCard}>
          <div className={styles.skeletonImage} />
          <div className={styles.skeletonLine} />
          <div className={styles.skeletonLine} style={{ width: '70%' }} />
        </div>
      ))}
    </div>
  );
}

function NewsSection({ items }) {
  return (
    <div className={styles.newsContainer}>
      <h2 className={styles.newsTitle}>News</h2>
      <div className={styles.newsGrid}>
        {items.map((item, idx) => (
          <article key={idx} className={styles.newsCard}>
            <div className={styles.newsHeader}>
              <Newspaper size={20} className={styles.newsIcon} />
              <h3>{item.title}</h3>
            </div>
            <p className={styles.newsDescription}>{item.description}</p>
          </article>
        ))}
      </div>
    </div>
  );
}

export default SearchInterface;
