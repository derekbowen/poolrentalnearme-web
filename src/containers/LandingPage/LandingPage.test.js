import React from 'react';
import '@testing-library/jest-dom';

import { renderWithProviders as render, testingLibrary } from '../../util/testHelpers';

import { LandingPageComponent } from './LandingPage';

const { screen, waitFor } = testingLibrary;

describe('LandingPage', () => {
  it('renders the marketplace hero, search and the fallback inventory when the feed is empty', async () => {
    render(
      <LandingPageComponent
        listings={[]}
        fetchInProgress={false}
        fetchError={null}
        isAuthenticated={false}
        scrollingDisabled={false}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Rent a pool you’ll fall in love with.')).toBeInTheDocument();
      expect(screen.getAllByText('Search pools').length).toBeGreaterThan(0);
      // Fallback pools carry the same all-in price rule as /s: $125 host rate → $143.75.
      expect(screen.getAllByText('$143.75').length).toBeGreaterThan(0);
      expect(screen.getByText('What are you getting into?')).toBeInTheDocument();
      expect(screen.getByText('Your pool could pay for itself.')).toBeInTheDocument();
      expect(screen.getByText('193 free classes for pool hosts.')).toBeInTheDocument();
      expect(screen.getAllByText('Stuck on anything? Text Derek.').length).toBeGreaterThan(0);
    });
  });

  it('shows a loading status while the live feed is in flight', async () => {
    render(
      <LandingPageComponent
        listings={[]}
        fetchInProgress={true}
        fetchError={null}
        isAuthenticated={false}
      />
    );
    await waitFor(() => {
      expect(screen.getByText('Loading live pools…')).toBeInTheDocument();
    });
  });
});
