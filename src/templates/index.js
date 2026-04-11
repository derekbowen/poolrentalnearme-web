import CleanListingPage from './clean/CleanListingPage';
import ResortListingPage from './resort/ResortListingPage';
import LuxuryListingPage from './luxury/LuxuryListingPage';
import PartyListingPage from './party/PartyListingPage';
import FamilyListingPage from './family/FamilyListingPage';
import BoldListingPage from './bold/BoldListingPage';

const TEMPLATES = {
  clean: CleanListingPage,
  resort: ResortListingPage,
  luxury: LuxuryListingPage,
  party: PartyListingPage,
  family: FamilyListingPage,
  bold: BoldListingPage,
};

export const getTemplateComponent = (style) => TEMPLATES[style] || CleanListingPage;
export default TEMPLATES;
