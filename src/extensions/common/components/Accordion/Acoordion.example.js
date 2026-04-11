import React from "react";

import Accordion from "./Accordion";
import Toggle from "../Toggle/Toggle";
import ExpandableSection from "../ExpandableSection/ExpandableSection";

const AccordionWrapper = () => {
  return (
    <Accordion key="example">
      <Toggle showArrow>Toggle here</Toggle>
      <ExpandableSection element="ul" needAnimation>
        <li>Item 1</li>
        <li>Item 2</li>
        <li>Item 3</li>
      </ExpandableSection>
    </Accordion>
  );
};

export default AccordionWrapper;
