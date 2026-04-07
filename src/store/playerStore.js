import { create } from 'zustand';

export const usePlayerStore = create((set, get) => ({
    // State
    currentSong: null,
    queue: [],
    isPlaying: false,
    volume: 0.7,
    currentTime: 0,
    duration: 0,
    repeat: 'none',
    shuffle: false,

    // Actions
    setCurrentSong: (song) => set({ currentSong: song }),
    setQueue: (songs) => set({ queue: songs }),
    togglePlay: () => set((state) => ({ isPlaying: !state.isPlaying })),
    setPlaying: (isPlaying) => set({ isPlaying }),
    setVolume: (volume) => set({ volume }),
    setCurrentTime: (time) => set({ currentTime: time }),
    setDuration: (duration) => set({ duration }),

    nextSong: () => {
        const { queue, currentSong } = get();
        if (!currentSong || queue.length === 0) return;
        const currentIndex = queue.findIndex(s => s.id === currentSong.id);
        const nextIndex = (currentIndex + 1) % queue.length;
        set({ currentSong: queue[nextIndex] });
    },

    previousSong: () => {
        const { queue, currentSong, currentTime } = get();
        if (!currentSong || queue.length === 0) return;

        if (currentTime > 3) {
            set({ currentTime: 0 });
            return;
        }

        const currentIndex = queue.findIndex(s => s.id === currentSong.id);
        const prevIndex = currentIndex - 1;

        if (prevIndex >= 0) {
            set({ currentSong: queue[prevIndex] });
        }
    },

    playSong: (song, queue = []) => {
        set({
            currentSong: song,
            queue: queue.length > 0 ? queue : [song],
            isPlaying: true
        });
    },
}));
