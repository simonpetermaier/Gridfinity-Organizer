'use strict';

// Theme system — keeps <html data-theme>, S.theme, and localStorage in sync.
// First apply runs from the inline head script (before paint) to avoid FOUC.
const Theme = {
  STORAGE_KEY: 'gridfinity:theme',

  current() {
    return document.documentElement.dataset.theme || 'light';
  },

  apply(t) {
    document.documentElement.dataset.theme = t;
    localStorage.setItem(this.STORAGE_KEY, t);
    S.theme = t;
  },

  toggle() {
    this.apply(this.current() === 'dark' ? 'light' : 'dark');
    App.render();
  },
};

// Sync initial S.theme with what the head script already applied.
S.theme = Theme.current();
