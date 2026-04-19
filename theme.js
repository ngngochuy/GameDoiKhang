(function() {
  function getTheme() {
    return localStorage.getItem('theme_preference') || 'system';
  }

  function applyTheme(theme) {
    let mode = theme;
    if (theme === 'system') {
      mode = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }
    
    if (mode === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }

  // Apply on load
  applyTheme(getTheme());

  // Listen for system changes
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
    if (getTheme() === 'system') {
      applyTheme('system');
    }
  });

  window.toggleTheme = function() {
    const current = getTheme();
    let next = 'system';
    
    // Cycle: system -> light -> dark -> system
    if (current === 'system') next = 'light';
    else if (current === 'light') next = 'dark';
    else next = 'system';
    
    localStorage.setItem('theme_preference', next);
    applyTheme(next);
    updateThemeIcon();
  };

  window.updateThemeIcon = function() {
    const current = getTheme();
    const btn = document.getElementById('theme-toggle-btn');
    if (!btn) return;

    let icon = '';
    let label = '';
    if (current === 'system') {
      icon = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>';
      label = 'Hệ thống';
    } else if (current === 'light') {
      icon = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>';
      label = 'Sáng';
    } else {
      icon = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>';
      label = 'Tối';
    }
    
    // Update inner HTML of button
    btn.innerHTML = `<div class="flex items-center justify-center gap-2">${icon} <span class="text-sm font-medium hidden sm:inline">${label}</span></div>`;
  };

  document.addEventListener('DOMContentLoaded', updateThemeIcon);
})();
