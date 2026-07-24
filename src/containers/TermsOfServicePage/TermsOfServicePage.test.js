import React from 'react';
import '@testing-library/jest-dom';

import { renderWithProviders as render, testingLibrary } from '../../util/testHelpers';

import TermsOfServicePage from './TermsOfServicePage';

const { waitFor } = testingLibrary;

describe('TermsOfServicePage', () => {
  it('renders the repo-baked v2026.1 terms with the version line', async () => {
    const { getByText, queryByText } = render(<TermsOfServicePage />);

    await waitFor(() => {
      // The version stamp rendered under the document title.
      expect(getByText(/Version 2026\.1/)).toBeInTheDocument();
    });

    // Defects migrated off the old Console asset must not appear in the served terms.
    expect(queryByText(/Hartford/i)).toBeNull();
    expect(queryByText(/August 6, 2025/)).toBeNull();
  });
});
