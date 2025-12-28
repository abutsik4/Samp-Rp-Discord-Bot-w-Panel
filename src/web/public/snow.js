// Snow Effect JavaScript
// Creates CSS-only snowflakes with graceful degradation for accessibility

(function() {
  'use strict';

  // Check if snow is enabled (from cookie or default to TRUE for auto-start)
  function getSnowEnabled() {
    const cookie = document.cookie.split('; ').find(row => row.startsWith('snowEnabled='));
    return cookie ? cookie.split('=')[1] === 'true' : true; // Default: ENABLED
  }

  // Check if user prefers reduced motion
  function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  // Initialize snow effect
  function initSnow() {
    // Don't show snow if user prefers reduced motion
    if (prefersReducedMotion()) {
      console.log('[Snow] Disabled due to prefers-reduced-motion');
      return;
    }

    // Don't show snow if not enabled in settings
    if (!getSnowEnabled()) {
      return;
    }

    // Create snow container
    const container = document.createElement('div');
    container.className = 'snow-container active';
    container.id = 'snowContainer';

    // Generate 40 snowflakes (performance-friendly amount)
    const snowflakeCount = window.innerWidth < 768 ? 25 : 40;
    
    for (let i = 0; i < snowflakeCount; i++) {
      const snowflake = document.createElement('div');
      snowflake.className = 'snowflake';
      snowflake.textContent = '❄';
      
      // Randomize position
      snowflake.style.left = Math.random() * 100 + '%';
      
      // Randomize animation duration (slower = more realistic)
      const duration = Math.random() * 5 + 8; // 8-13 seconds
      snowflake.style.animationDuration = duration + 's';
      
      // Randomize animation delay for staggered effect
      snowflake.style.animationDelay = Math.random() * 5 + 's';
      
      // Randomize opacity
      snowflake.style.opacity = Math.random() * 0.6 + 0.4; // 0.4-1.0
      
      // Randomize size slightly
      const size = Math.random() * 0.5 + 0.8; // 0.8-1.3rem
      snowflake.style.fontSize = size + 'rem';
      
      container.appendChild(snowflake);
    }

    document.body.appendChild(container);
    console.log('[Snow] Effect initialized with', snowflakeCount, 'snowflakes');
  }

  // Toggle snow effect
  window.toggleSnow = function() {
    const currentState = getSnowEnabled();
    const newState = !currentState;
    
    // Save to cookie
    document.cookie = `snowEnabled=${newState};path=/;max-age=31536000`;
    
    // Update button if it exists
    const btn = document.getElementById('snowToggle');
    if (btn) {
      btn.style.opacity = newState ? '1' : '0.5';
      btn.title = newState ? 'Snow: ON (click to disable)' : 'Snow: OFF (click to enable)';
    }
    
    // Reload page to apply
    window.location.reload();
  };

  // Update button state on load
  window.addEventListener('DOMContentLoaded', function() {
    const btn = document.getElementById('snowToggle');
    if (btn) {
      const enabled = getSnowEnabled();
      btn.style.opacity = enabled ? '1' : '0.5';
      btn.title = enabled ? 'Snow: ON (click to disable)' : 'Snow: OFF (click to enable)';
    }
  });

  // Initialize on DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSnow);
  } else {
    initSnow();
  }
})();
