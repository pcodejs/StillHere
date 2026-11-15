import React from 'react';

// Packaged Simple Icons marks; they never load from a third-party server.
export function PlatformLogo({platform, className = ''}) {
  return <img className={'platform-logo platform-' + (platform === 'facebook' ? 'facebook' : 'zalo') + ' ' + className}
    src={'assets/platforms/' + (platform === 'facebook' ? 'facebook' : 'zalo') + '.svg'}
    width="64" height="64" alt="" aria-hidden="true" />;
}

export function WelcomeArt({className = '', scene = 'onboarding'}) {
  return <img className={'welcome-art ' + className} src={`assets/illustrations/${scene}.png`}
    width="1536" height="1024" alt="" aria-hidden="true" />;
}
