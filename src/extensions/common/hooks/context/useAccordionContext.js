import { createContext, useContext } from 'react';

const AccordionContext = createContext(null);

const useAccordionContext = () => useContext(AccordionContext);

export const AccordionProvider = AccordionContext.Provider;

export default useAccordionContext;
