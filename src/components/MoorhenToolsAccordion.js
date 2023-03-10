import { useRef, Fragment, useEffect } from "react";
import { Row } from "react-bootstrap";
import { MoorhenRamachandran } from "./MoorhenRamachandran"
import { MoorhenValidation } from "./MoorhenValidation"
import { MoorhenDifferenceMapPeaks } from "./MoorhenDifferenceMapPeaks"
import { MoorhenPepflipsDifferenceMap } from "./MoorhenPepflipsDifferenceMap"
import { MoorhenFillMissingAtoms } from "./MoorhenFillMissingAtoms"
import { MoorhenMMRRCCPlot } from "./MoorhenMMRRCCPlot"
import { Autocomplete, TextField } from "@mui/material";

export const MoorhenToolsAccordion = (props) => {
    const toolsAccordionSelectRef = useRef()

    const toolOptions = [
            {label: "Difference Map Peaks", toolWidget: <MoorhenDifferenceMapPeaks {...props}/>},
            {label: "Ramachandran Plot", toolWidget: <MoorhenRamachandran {...props}/>},
            {label: "Validation", toolWidget: <MoorhenValidation {...props}/>},
            {label: "Peptide flips using difference map", toolWidget: <MoorhenPepflipsDifferenceMap {...props}/>},
            {label: "Fill partial residues", toolWidget: <MoorhenFillMissingAtoms {...props}/>},
            {label: "MMRRCC plot", toolWidget: <MoorhenMMRRCCPlot {...props}/>}
    ]

    const handleChange = (evt, newSelection) => {
        if (newSelection) {
            const newToolIndex = toolOptions.findIndex(tool => tool.label === newSelection)
            props.setSelectedToolKey(newToolIndex)
        } else {
            props.setSelectedToolKey(null)
        }
    }

    useEffect(() => {
        toolsAccordionSelectRef.current.value = props.selectedToolKey
    }, [props.selectedToolKey])
            
    return <Fragment> 
            <Row style={{padding: '0.5rem', width:'100%', display:'inline-flex'}}>
                <Autocomplete 
                        disablePortal
                        sx={{
                            '& .MuiInputBase-root': {
                                backgroundColor:  props.darkMode ? '#222' : 'white',
                                color: props.darkMode ? 'white' : '#222',
                              },
                              '& .MuiOutlinedInput-notchedOutline': {
                                borderColor: props.darkMode ? 'white' : 'grey',
                              },
                              '& .MuiButtonBase-root': {
                                color: props.darkMode ? 'white' : 'grey',
                              },
                              '& .MuiFormLabel-root': {
                                color: props.darkMode ? 'white' : '#222',
                              },
                            }}
                        ref={toolsAccordionSelectRef}
                        onChange={handleChange}
                        size='small'
                        options={toolOptions.map(tool => tool.label)}
                        renderInput={(params) => <TextField {...params} label="Tool" />}
                    />
            </Row>
            <Row className="tool-container-row" style={{width:'100%', margin:'0rem', padding:'0rem'}}>
                {props.selectedToolKey !== null ? toolOptions[props.selectedToolKey].toolWidget : null}
            </Row>
        </Fragment> 
}

