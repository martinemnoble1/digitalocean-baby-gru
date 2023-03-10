import { CheckOutlined, CloseOutlined } from "@mui/icons-material";
import { MenuItem, MenuList, Tooltip } from "@mui/material";
import { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import { Button, Overlay, Container, Row, FormSelect, FormGroup, FormLabel, Card } from "react-bootstrap"
import { MoorhenMoleculeSelect } from "./MoorhenMoleculeSelect";
import { MoorhenCidInputForm } from "./MoorhenCidInputForm";
import { cidToSpec, getTooltipShortcutLabel, residueCodesThreeToOne } from "../utils/MoorhenUtils";

const refinementFormatArgs = (molecule, chosenAtom, pp) => {
    return [
        molecule.molNo,
        `//${chosenAtom.chain_id}/${chosenAtom.res_no}`,
        pp.refine.mode]
}

const MoorhenSimpleEditButton = forwardRef((props, buttonRef) => {
    const [prompt, setPrompt] = useState(null)
    const target = useRef(null)
    const [localParameters, setLocalParameters] = useState({})

    useEffect(() => {
        setPrompt(props.prompt)
    }, [props.prompt])

    useEffect(() => {
        setLocalParameters(props.panelParameters)
    }, [])

    useEffect(() => {
        //console.log('changing panelParameters', props.panelParameters)
        setLocalParameters(props.panelParameters)
    }, [props.panelParameters])

    const atomClickedCallback = useCallback(event => {
        //console.log('in atomClickedcallback', event, props.molecules.length)
        document.removeEventListener('atomClicked', atomClickedCallback, { once: true })
        props.molecules.forEach(async (molecule) => {
            console.log('Testing molecule ', molecule.molNo)
            try {
                if (molecule.buffersInclude(event.detail.buffer)) {
                    props.setCursorStyle("default")
                    const chosenAtom = cidToSpec(event.detail.atom.label)
                    let formattedArgs = props.formatArgs(molecule, chosenAtom, localParameters)
                    props.setSelectedButtonIndex(null)
                    if (props.cootCommand) {
                        const result = await props.commandCentre.current.cootCommand({
                            returnType: props.returnType,
                            command: props.cootCommand,
                            commandArgs: formattedArgs,
                            changesMolecules: props.changesMolecule ? [molecule.molNo] : []
                        }, true)
                        if (props.onCompleted) {
                            props.onCompleted(molecule, chosenAtom)
                        }
                        if (props.refineAfterMod && props.activeMap) {
                            console.log('Triggering post-modification triple refinement...')
                            try {
                                const result = await props.commandCentre.current.cootCommand({
                                    returnType: "status",
                                    command: 'refine_residues_using_atom_cid',
                                    commandArgs: refinementFormatArgs(molecule, chosenAtom, { refine: { mode: 'TRIPLE' } }),
                                    changesMolecules: [molecule.molNo]
                                }, true)
                                console.log(`Refine result `, result)
                            }
                            catch (err) {
                                console.log(`Exception raised in Refine [${err}]`)
                            }
                        }
                        molecule.setAtomsDirty(true)
                        molecule.redraw(props.glRef)

                        const mapUpdateEvent = new CustomEvent("mapUpdate", { detail: { origin: props.glRef.current.origin, modifiedMolecule: molecule.molNo } })
                        document.dispatchEvent(mapUpdateEvent);

                        if (props.onExit) {
                            props.onExit(molecule, chosenAtom, result)
                        }
                    } else if (props.nonCootCommand) {
                        props.nonCootCommand(molecule, chosenAtom, localParameters)
                    }
                }
                else {
                    console.log('molecule for buffer not found')
                }
            }
            catch (err) {
                console.log('Encountered', err)
            }
        })
    }, [props.molecules.length, props.activeMap, props.refineAfterMod, localParameters])

    useEffect(() => {
        props.setCursorStyle("crosshair")
        if (props.awaitAtomClick && props.selectedButtonIndex === props.buttonIndex) {
            props.setCursorStyle("crosshair")
            document.addEventListener('atomClicked', atomClickedCallback, { once: true })
        }

        return () => {
            props.setCursorStyle("default")
            document.removeEventListener('atomClicked', atomClickedCallback, { once: true })
        }
    }, [props.selectedButtonIndex])

    return <>
        <Tooltip title={(props.needsMapData && !props.activeMap) || (props.needsAtomData && props.molecules.length === 0) ? '' : props.toolTip}>
            <div>
                <Button value={props.buttonIndex}
                    id={props.id}
                    size="sm"
                    ref={buttonRef ? buttonRef : target}
                    active={props.buttonIndex === props.selectedButtonIndex}
                    variant='light'
                    style={{ borderColor: props.buttonIndex === props.selectedButtonIndex ? 'red' : '' }}
                    disabled={props.needsMapData && !props.activeMap ||
                        (props.needsAtomData && props.molecules.length === 0)}
                    onClick={(evt) => {
                        props.setSelectedButtonIndex(props.buttonIndex !== props.selectedButtonIndex ? props.buttonIndex : null)
                    }}>
                    {props.icon}
                </Button>
            </div>
        </Tooltip>

        {
            prompt && <Overlay target={buttonRef ? buttonRef.current : target.current} show={props.buttonIndex === props.selectedButtonIndex} placement="top">
                {({ placement, arrowProps, show: _show, popper, ...props }) => (
                    <div
                        {...props}
                        style={{
                            position: 'absolute',
                            marginBottom: '0.5rem',
                            backgroundColor: 'rgba(150, 200, 150, 0.5)',
                            padding: '2px 10px',
                            color: 'black',
                            borderRadius: 3,
                            ...props.style,
                        }}
                    >{prompt}
                    </div>
                )}
            </Overlay>
        }
    </>
})
MoorhenSimpleEditButton.defaultProps = {
    id: '', toolTip: "", setCursorStyle: () => { },
    returnType: 'status', needsAtomData: true, prompt: null,
    setSelectedButtonIndex: () => { }, selectedButtonIndex: 0,
    changesMolecule: true, refineAfterMod: false, onCompleted: null,
    awaitAtomClick: true, onExit: null
}


export const MoorhenAutofitRotamerButton = (props) => {
    const [toolTip, setToolTip] = useState("Auto-fit Rotamer")

    useEffect(() => {
        if (props.shortCuts) {
            const shortCut = JSON.parse(props.shortCuts).auto_fit_rotamer
            setToolTip(`Auto-fit Rotamer ${getTooltipShortcutLabel(shortCut)}`)
        }
    }, [props.shortCuts])

    return <MoorhenSimpleEditButton {...props}
        id='auto-fit-rotamer-edit-button'
        toolTip={toolTip}
        buttonIndex={props.buttonIndex}
        selectedButtonIndex={props.selectedButtonIndex}
        setSelectedButtonIndex={props.setSelectedButtonIndex}
        needsMapData={true}
        cootCommand="fill_partial_residue"
        prompt="Click atom in residue to fit rotamer"
        icon={<img className="baby-gru-button-icon" src={`${props.urlPrefix}/baby-gru/pixmaps/auto-fit-rotamer.svg`} alt='Auto-Fit rotamer' />}
        formatArgs={(molecule, chosenAtom) => {
            return [
                molecule.molNo,
                chosenAtom.chain_id,
                chosenAtom.res_no,
                chosenAtom.ins_code
            ]
        }} />
}

export const MoorhenFlipPeptideButton = (props) => {
    const [toolTip, setToolTip] = useState("Flip Peptide")

    useEffect(() => {
        if (props.shortCuts) {
            const shortCut = JSON.parse(props.shortCuts).flip_peptide
            setToolTip(`Flip Peptide ${getTooltipShortcutLabel(shortCut)}`)
        }
    }, [props.shortCuts])

    return <MoorhenSimpleEditButton {...props}
        id="flip-peptide-edit-button"
        toolTip={toolTip}
        buttonIndex={props.buttonIndex}
        selectedButtonIndex={props.selectedButtonIndex}
        setSelectedButtonIndex={props.setSelectedButtonIndex}
        needsMapData={false}
        cootCommand="flipPeptide_cid"
        prompt="Click atom in residue to flip"
        icon={<img className="baby-gru-button-icon" src={`${props.urlPrefix}/baby-gru/pixmaps/flip-peptide.svg`} alt='Flip Peptide' />}
        formatArgs={(molecule, chosenAtom) => {
            return [molecule.molNo, `//${chosenAtom.chain_id}/${chosenAtom.res_no}/${chosenAtom.atom_name}`, '']
        }} />
}

export const MoorhenConvertCisTransButton = (props) => {
    return <MoorhenSimpleEditButton {...props}
        id='cis-trans-edit-button'
        toolTip="Cis/Trans isomerisation"
        buttonIndex={props.buttonIndex}
        selectedButtonIndex={props.selectedButtonIndex}
        setSelectedButtonIndex={props.setSelectedButtonIndex}
        needsMapData={false}
        cootCommand="cis_trans_convert"
        prompt="Click atom in residue to convert"
        icon={<img className="baby-gru-button-icon" alt="Cis/Trans" src={`${props.urlPrefix}/baby-gru/pixmaps/cis-trans.svg`} />}
        formatArgs={(molecule, chosenAtom) => {
            return [molecule.molNo, `//${chosenAtom.chain_id}/${chosenAtom.res_no}/${chosenAtom.atom_name}${chosenAtom.alt_conf === "" ? "" : ":" + chosenAtom.alt_conf
                }`]
        }} />
}

export const MoorhenSideChain180Button = (props) => {
    return <MoorhenSimpleEditButton {...props}
        id='rotate-sidechain-edit-button'
        toolTip="Rotate side-chain 180 degrees"
        buttonIndex={props.buttonIndex}
        selectedButtonIndex={props.selectedButtonIndex}
        setSelectedButtonIndex={props.setSelectedButtonIndex}
        needsMapData={false}
        cootCommand="side_chain_180"
        prompt="Click atom in residue to flip sidechain"
        icon={<img className="baby-gru-button-icon" src={`${props.urlPrefix}/baby-gru/pixmaps/side-chain-180.svg`} alt='Rotate Side-chain' />}
        formatArgs={(molecule, chosenAtom) => {
            return [molecule.molNo, `//${chosenAtom.chain_id}/${chosenAtom.res_no}`]
        }} />
}

export const MoorhenRefineResiduesUsingAtomCidButton = (props) => {
    const [toolTip, setToolTip] = useState("Refine Residues")
    const [panelParameters, setPanelParameters] = useState({
        refine: { mode: 'TRIPLE' },
        delete: { mode: 'ATOM' },
        mutate: { toType: "ALA" }
    })

    useEffect(() => {
        if (props.shortCuts) {
            const shortCut = JSON.parse(props.shortCuts).triple_refine
            setToolTip(`Refine Residues ${getTooltipShortcutLabel(shortCut)}`)
        }
    }, [props.shortCuts])

    const MoorhenRefinementPanel = (props) => {
        const refinementModes = ['SINGLE', 'TRIPLE', 'QUINTUPLE', 'HEPTUPLE', 'SPHERE', 'BIG_SPHERE', 'CHAIN', 'ALL']
        return <Container>
            <Row>Please click an atom for centre of refinement</Row>
            <Row>
                <FormGroup>
                    <FormLabel>Refinement mode</FormLabel>
                    <FormSelect defaultValue={props.panelParameters.refine.mode}
                        onChange={(e) => {
                            const newParameters = { ...props.panelParameters }
                            newParameters.refine.mode = e.target.value
                            props.setPanelParameters(newParameters)
                        }}>
                        {refinementModes.map(optionName => {
                            return <option key={optionName} value={optionName}>{optionName}</option>
                        })}
                    </FormSelect>
                </FormGroup>
            </Row>
        </Container>
    }
    return <MoorhenSimpleEditButton {...props}
        id='refine-residues-edit-button'
        toolTip={toolTip}
        buttonIndex={props.buttonIndex}
        selectedButtonIndex={props.selectedButtonIndex}
        setSelectedButtonIndex={props.setSelectedButtonIndex}
        needsMapData={true}
        cootCommand="refine_residues_using_atom_cid"
        panelParameters={panelParameters}
        prompt={<MoorhenRefinementPanel
            setPanelParameters={setPanelParameters}
            panelParameters={panelParameters} />}
        icon={<img className="baby-gru-button-icon" src={`${props.urlPrefix}/baby-gru/pixmaps/refine-1.svg`} alt='Refine Residues' />}
        formatArgs={(m, c, p) => refinementFormatArgs(m, c, p)}
        refineAfterMod={false} />
}

export const MoorhenAddSideChainButton = (props) => {

    return <MoorhenSimpleEditButton {...props}
        toolTip="Add a side chain"
        buttonIndex={props.buttonIndex}
        selectedButtonIndex={props.selectedButtonIndex}
        setSelectedButtonIndex={props.setSelectedButtonIndex}
        needsMapData={true}
        cootCommand="fill_partial_residue"
        prompt="Click atom in residue to add a side chain"
        icon={<img className="baby-gru-button-icon" alt="Add side chain" src={`${props.urlPrefix}/baby-gru/pixmaps/add-side-chain.svg`} />}
        formatArgs={(molecule, chosenAtom) => {
            return [molecule.molNo, chosenAtom.chain_id, chosenAtom.res_no, chosenAtom.ins_code]
        }} />
}

export const MoorhenAddAltConfButton = (props) => {

    return <MoorhenSimpleEditButton {...props}
        toolTip="Add alternative conformation"
        buttonIndex={props.buttonIndex}
        selectedButtonIndex={props.selectedButtonIndex}
        setSelectedButtonIndex={props.setSelectedButtonIndex}
        needsMapData={false}
        cootCommand="add_alternative_conformation"
        prompt="Click atom in residue to add alternative conformation"
        refineAfterMod={false}
        icon={<img className="baby-gru-button-icon" alt="Add side chain" src={`${props.urlPrefix}/baby-gru/pixmaps/add-alt-conf.svg`} />}
        formatArgs={(molecule, chosenAtom) => {
            return [molecule.molNo, `/1/${chosenAtom.chain_id}/${chosenAtom.res_no}/*${chosenAtom.alt_conf === "" ? "" : ":" + chosenAtom.alt_conf}`]
        }} />
}

export const MoorhenDeleteUsingCidButton = (props) => {
    const [toolTip, setToolTip] = useState("Delete Item")
    const [panelParameters, setPanelParameters] = useState({
        refine: { mode: 'TRIPLE' },
        delete: { mode: 'ATOM' },
        mutate: { toType: "ALA" }
    })

    useEffect(() => {
        if (props.shortCuts) {
            const shortCut = JSON.parse(props.shortCuts).delete_residue
            setToolTip(`Delete Item ${getTooltipShortcutLabel(shortCut)}`)
        }
    }, [props.shortCuts])

    const deleteMoleculeIfEmpty = (molecule, chosenAtom, cootResult) => {
        if (cootResult.data.result.result.second < 1) {
            console.log('Empty molecule detected, deleting it now...')
            molecule.delete(props.glRef)
            props.changeMolecules({ action: 'Remove', item: molecule })
        }
    }

    const MoorhenDeletePanel = (props) => {
        const deleteModes = ['ATOM', 'RESIDUE', 'RESIDUE HYDROGENS', 'RESIDUE SIDE-CHAIN', 'CHAIN', 'CHAIN HYDROGENS', 'MOLECULE HYDROGENS']
        return <Container>
            <Row>Please click an atom for core of deletion</Row>
            <Row>
                <FormGroup>
                    <FormLabel>Delete mode</FormLabel>
                    <FormSelect defaultValue={props.panelParameters.delete.mode}
                        onChange={(e) => {
                            const newParameters = { ...props.panelParameters }
                            newParameters.delete.mode = e.target.value
                            props.setPanelParameters(newParameters)
                        }}>
                        {deleteModes.map(optionName => {
                            return <option key={optionName} value={optionName}>{optionName}</option>
                        })}
                    </FormSelect>
                </FormGroup>
            </Row>
        </Container>
    }

    const deleteFormatArgs = (molecule, chosenAtom, pp) => {
        //console.log({ molecule, chosenAtom, pp })
        let commandArgs
        if (pp.delete.mode === 'CHAIN') {
            commandArgs = [molecule.molNo, `/1/${chosenAtom.chain_id}/*/*:*`, 'LITERAL']
        } else if (pp.delete.mode === 'RESIDUE') {
            commandArgs = [molecule.molNo, `/1/${chosenAtom.chain_id}/${chosenAtom.res_no}/*${chosenAtom.alt_conf === "" ? "" : ":" + chosenAtom.alt_conf}`, 'LITERAL']
        } else if (pp.delete.mode === 'ATOM') {
            commandArgs = [molecule.molNo, `/1/${chosenAtom.chain_id}/${chosenAtom.res_no}/${chosenAtom.atom_name}${chosenAtom.alt_conf === "" ? "" : ":" + chosenAtom.alt_conf}`, 'LITERAL']
        } else if (pp.delete.mode === 'RESIDUE SIDE-CHAIN') {
            commandArgs = [molecule.molNo, `/1/${chosenAtom.chain_id}/${chosenAtom.res_no}/!N,CA,CB,C,O,HA,H`, 'LITERAL']
        } else if (pp.delete.mode === 'RESIDUE HYDROGENS') {
            commandArgs = [molecule.molNo, `/1/${chosenAtom.chain_id}/${chosenAtom.res_no}/[H,D]`, 'LITERAL']
        } else if (pp.delete.mode === 'MOLECULE HYDROGENS') {
            commandArgs = [molecule.molNo, `/1/*/*/[H,D]`, 'LITERAL']
        } else {
            commandArgs = [molecule.molNo, `/1/${chosenAtom.chain_id}/*/[H,D]`, 'LITERAL']
        }
        return commandArgs
    }

    return <MoorhenSimpleEditButton {...props}
        toolTip={toolTip}
        buttonIndex={props.buttonIndex}
        selectedButtonIndex={props.selectedButtonIndex}
        setSelectedButtonIndex={props.setSelectedButtonIndex}
        needsMapData={false}
        cootCommand="delete_using_cid"
        returnType="pair"
        onExit={deleteMoleculeIfEmpty}
        panelParameters={panelParameters}
        prompt={<MoorhenDeletePanel
            setPanelParameters={setPanelParameters}
            panelParameters={panelParameters} />}
        icon={<img className="baby-gru-button-icon" src={`${props.urlPrefix}/baby-gru/pixmaps/delete.svg`} />}
        formatArgs={(m, c, p) => deleteFormatArgs(m, c, p)}
        refineAfterMod={false} />
}

export const MoorhenMutateButton = (props) => {

    const autoFitRotamer = useCallback(async (molecule, chosenAtom) => {
        console.log('Post-mutation autofit rotamer...')
        const formattedArgs = [
            molecule.molNo,
            chosenAtom.chain_id,
            chosenAtom.res_no,
            chosenAtom.ins_code,
            chosenAtom.alt_conf,
            props.activeMap.molNo
        ]
        await props.commandCentre.current.cootCommand({
            returnType: "status",
            command: "auto_fit_rotamer",
            commandArgs: formattedArgs,
            changesMolecules: [molecule.molNo]
        }, true)
    }, [props.activeMap, props.commandCentre])

    const [panelParameters, setPanelParameters] = useState({
        refine: { mode: 'TRIPLE' },
        delete: { mode: 'ATOM' },
        mutate: { toType: "ALA" }
    })

    const MoorhenMutatePanel = (props) => {
        const toTypes = ['ALA', 'CYS', 'ASP', 'GLU', 'PHE', 'GLY', 'HIS', 'ILE',
            'LYS', 'LEU', 'MET', 'ASN', 'PRO', 'GLN', 'ARG', 'SER', 'THR', 'VAL', 'TRP', 'TYR']
        return <Container>
            <Row>Please identify residue to mutate</Row>
            <Row>
                <FormGroup>
                    <FormLabel>To residue of type</FormLabel>
                    <FormSelect defaultValue={props.panelParameters.mutate.toType}
                        onChange={(e) => {
                            const newParameters = { ...props.panelParameters }
                            newParameters.mutate.toType = e.target.value
                            props.setPanelParameters(newParameters)
                        }}>
                        {toTypes.map(optionName => {
                            return <option key={optionName} value={optionName}>{`${optionName} (${residueCodesThreeToOne[optionName]})`}</option>
                        })}
                    </FormSelect>
                </FormGroup>
            </Row>
        </Container>
    }

    const mutateFormatArgs = (molecule, chosenAtom, pp) => {
        return [
            molecule.molNo,
            `//${chosenAtom.chain_id}/${chosenAtom.res_no}`,
            pp.mutate.toType]
    }

    return <MoorhenSimpleEditButton {...props}
        id='mutate-residue-edit-button'
        toolTip="Simple Mutate"
        buttonIndex={props.buttonIndex}
        selectedButtonIndex={props.selectedButtonIndex}
        setSelectedButtonIndex={props.setSelectedButtonIndex}
        needsMapData={true}
        onCompleted={autoFitRotamer}
        cootCommand="mutate"
        panelParameters={panelParameters}
        prompt={<MoorhenMutatePanel
            setPanelParameters={setPanelParameters}
            panelParameters={panelParameters} />}
        icon={<img className="baby-gru-button-icon" src={`${props.urlPrefix}/baby-gru/pixmaps/mutate.svg`} alt='Mutate' />}
        formatArgs={(m, c, p) => mutateFormatArgs(m, c, p)} />
}

export const MoorhenAddTerminalResidueDirectlyUsingCidButton = (props) => {
    const [toolTip, setToolTip] = useState("Add Residue")

    useEffect(() => {
        if (props.shortCuts) {
            const shortCut = JSON.parse(props.shortCuts).add_terminal_residue
            setToolTip(`Add Residue ${getTooltipShortcutLabel(shortCut)}`)
        }
    }, [props.shortCuts])

    return <MoorhenSimpleEditButton {...props}
        toolTip={toolTip}
        buttonIndex={props.buttonIndex}
        selectedButtonIndex={props.selectedButtonIndex}
        setSelectedButtonIndex={props.setSelectedButtonIndex}
        needsMapData={true}
        cootCommand="add_terminal_residue_directly_using_cid"
        prompt="Click atom in residue to add a residue to that residue"
        icon={<img className="baby-gru-button-icon" src={`${props.urlPrefix}/baby-gru/pixmaps/add-peptide-1.svg`} alt='Add Residue' />}
        formatArgs={(molecule, chosenAtom) => {
            return [molecule.molNo, `//${chosenAtom.chain_id}/${chosenAtom.res_no}`]
        }} />
}

export const MoorhenEigenFlipLigandButton = (props) => {
    const [toolTip, setToolTip] = useState("Eigen Flip: flip the ligand around its eigenvectors")

    useEffect(() => {
        if (props.shortCuts) {
            const shortCut = JSON.parse(props.shortCuts).eigen_flip
            setToolTip(`Eigen Flip: flip the ligand around its eigenvectors ${getTooltipShortcutLabel(shortCut)}`)
        }
    }, [props.shortCuts])

    return <MoorhenSimpleEditButton {...props}
        id='eigen-flip-edit-button'
        toolTip={toolTip}
        buttonIndex={props.buttonIndex}
        selectedButtonIndex={props.selectedButtonIndex}
        setSelectedButtonIndex={props.setSelectedButtonIndex}
        needsMapData={false}
        cootCommand="eigen_flip_ligand"
        prompt="Click atom in residue to eigen flip it"
        icon={<img className="baby-gru-button-icon" src={`${props.urlPrefix}/baby-gru/pixmaps/spin-view.svg`} />}
        formatArgs={(molecule, chosenAtom) => {
            return [molecule.molNo, `//${chosenAtom.chain_id}/${chosenAtom.res_no}`]
        }} />
}

export const MoorhenJedFlipFalseButton = (props) => {
    return <MoorhenSimpleEditButton {...props}
        toolTip="JED Flip: wag the tail"
        buttonIndex={props.buttonIndex}
        selectedButtonIndex={props.selectedButtonIndex}
        setSelectedButtonIndex={props.setSelectedButtonIndex}
        needsMapData={false}
        cootCommand="jed_flip"
        prompt="Click atom in residue to flip around that rotatable bond - wag the tail"
        icon={<img className="baby-gru-button-icon" src={`${props.urlPrefix}/baby-gru/pixmaps/edit-chi.svg`} />}
        formatArgs={(molecule, chosenAtom) => {
            return [molecule.molNo, `//${chosenAtom.chain_id}/${chosenAtom.res_no}/${chosenAtom.atom_name}${chosenAtom.alt_conf === "" ? "" : ":" + chosenAtom.alt_conf}`, false]
        }} />
}

export const MoorhenJedFlipTrueButton = (props) => {
    return <MoorhenSimpleEditButton {...props}
        toolTip="JED Flip: wag the dog"
        buttonIndex={props.buttonIndex}
        selectedButtonIndex={props.selectedButtonIndex}
        setSelectedButtonIndex={props.setSelectedButtonIndex}
        needsMapData={false}
        cootCommand="jed_flip"
        prompt="Click atom in residue to flip around that rotatable bond - wag the dog"
        icon={<img alt="jed-flip" className="baby-gru-button-icon" src={`${props.urlPrefix}/baby-gru/pixmaps/jed-flip-reverse.svg`} />}
        formatArgs={(molecule, chosenAtom) => {
            return [molecule.molNo, `//${chosenAtom.chain_id}/${chosenAtom.res_no}/${chosenAtom.atom_name}${chosenAtom.alt_conf === "" ? "" : ":" + chosenAtom.alt_conf}`, true]
        }} />
}

export const MoorhenRotateTranslateZoneButton = (props) => {
    const [showAccept, setShowAccept] = useState(false)
    const [tips, setTips] = useState(null)
    const theButton = useRef(null)
    const fragmentMolecule = useRef(null)
    const chosenMolecule = useRef(null)
    const rotateTranslateMode = useRef('RESIDUE')
    const fragmentCid = useRef(null)
    const customCid = useRef(null)
    const { changeMolecules, backgroundColor, glRef, shortCuts, defaultBondSmoothness } = props

    const MoorhenRotateTranslatePanel = () => {
        const rotateTranslateModes = ['ATOM', 'RESIDUE', 'CHAIN', 'MOLECULE', 'CUSTOM']
        const [localRotateTranslateMode, setLocalRotateTranslateMode] = useState(rotateTranslateMode.current)
        return <Container>
            <Row>Please click an atom to define object</Row>
            <Row>
                <FormGroup>
                    <FormLabel>Rotate/translate mode</FormLabel>
                    <FormSelect defaultValue={rotateTranslateMode.current}
                        onChange={(e) => {
                            rotateTranslateMode.current = e.target.value
                            setLocalRotateTranslateMode(rotateTranslateMode.current)
                        }}>
                        {rotateTranslateModes.map(optionName => {
                            return <option key={optionName} value={optionName}>{optionName}</option>
                        })}
                    </FormSelect>
                </FormGroup>
            </Row>
            <Row>
                {localRotateTranslateMode === 'CUSTOM' && 
                    <MoorhenCidInputForm defaultValue={customCid.current} onChange={(e) => { customCid.current = e.target.value }} placeholder={customCid.current ? "" : "Input custom cid e.g. //A,B"}/>
                }
            </Row>
        </Container>
    }

    useEffect(() => {
        if (shortCuts) {
            const shortCut = JSON.parse(shortCuts).residue_camera_wiggle
            setTips(<>
                <em>{"Hold <Shift><Alt> to translate"}</em>
                <br></br>
                <em>{`Hold ${getTooltipShortcutLabel(shortCut)} to move view`}</em>
                <br></br>
                <br></br>
            </>
            )
        }
    }, [shortCuts])

    const acceptTransform = useCallback(async (e) => {
        glRef.current.setActiveMolecule(null)
        const transformedAtoms = fragmentMolecule.current.transformedCachedAtomsAsMovedAtoms(glRef)
        await chosenMolecule.current.updateWithMovedAtoms(transformedAtoms, glRef)
        changeMolecules({ action: 'Remove', item: fragmentMolecule.current })
        fragmentMolecule.current.delete(glRef)
        chosenMolecule.current.unhideAll(glRef)
        setShowAccept(false)
        const mapUpdateEvent = new CustomEvent("mapUpdate", { detail: { origin: glRef.current.origin, modifiedMolecule: chosenMolecule.current.molNo } })
        document.dispatchEvent(mapUpdateEvent)
    }, [changeMolecules, glRef])

    const rejectTransform = useCallback(async (e) => {
        glRef.current.setActiveMolecule(null)
        changeMolecules({ action: 'Remove', item: fragmentMolecule.current })
        fragmentMolecule.current.delete(glRef)
        chosenMolecule.current.unhideAll(glRef)
        setShowAccept(false)
    }, [changeMolecules, glRef])

    const nonCootCommand = async (molecule, chosenAtom, p) => {
        chosenMolecule.current = molecule
        switch (rotateTranslateMode.current) {
            case 'ATOM':
                fragmentCid.current =
                    `//${chosenAtom.chain_id}/${chosenAtom.res_no}/${chosenAtom.atom_name}${chosenAtom.alt_conf === "" ? "" : ":" + chosenAtom.alt_conf}`
                break;
            case 'RESIDUE':
                fragmentCid.current =
                    `//${chosenAtom.chain_id}/${chosenAtom.res_no}/*${chosenAtom.alt_conf === "" ? "" : ":" + chosenAtom.alt_conf}`
                break;
            case 'CHAIN':
                fragmentCid.current =
                    `//${chosenAtom.chain_id}`
                break;
            case 'MOLECULE':
                fragmentCid.current =
                    `/*/*`
                break;
            case 'CUSTOM':
                fragmentCid.current = customCid.current
                break;
            default:
                console.log('Unrecognised rotate/translate selection...')
                break;        
        }
        if (!fragmentCid.current) {
            return
        }
        chosenMolecule.current.hideCid(fragmentCid.current, glRef)
        /* Copy the component to move into a new molecule */
        const newMolecule = await molecule.copyFragmentUsingCid(
            fragmentCid.current, backgroundColor, defaultBondSmoothness, glRef, false
        )
        await newMolecule.updateAtoms()
        Object.keys(molecule.displayObjects)
            .filter(style => { return ['CRs', 'CBs', 'ligands', 'gaussian', 'MolecularSurface', 'VdWSurface', 'DishyBases'].includes(style) })
            .forEach(async style => {
                console.log({ style }, molecule.displayObjects[style].length)
                if (molecule.displayObjects[style].length > 0 &&
                    molecule.displayObjects[style][0].visible) {
                    await newMolecule.drawWithStyleFromAtoms(style, glRef)
                }
            })
        fragmentMolecule.current = newMolecule
        /* redraw */
        changeMolecules({ action: "Add", item: newMolecule })
        glRef.current.setActiveMolecule(newMolecule)
        setShowAccept(true)
    }

    return <><MoorhenSimpleEditButton ref={theButton} {...props}
        toolTip="Rotate/Translate zone"
        buttonIndex={props.buttonIndex}
        selectedButtonIndex={props.selectedButtonIndex}
        setSelectedButtonIndex={props.setSelectedButtonIndex}
        needsMapData={false}
        nonCootCommand={nonCootCommand}
        prompt={<MoorhenRotateTranslatePanel />}
        icon={<img alt="rotate/translate" className="baby-gru-button-icon" src={`${props.urlPrefix}/baby-gru/pixmaps/rtz.svg`}/>}
        formatArgs={(molecule, chosenAtom) => {
            return [molecule.molNo, `//${chosenAtom.chain_id}/${chosenAtom.res_no}/${chosenAtom.atom_name}`, true]
        }} />
        <Overlay target={theButton.current} show={showAccept} placement="top">
            {({ placement, arrowProps, show: _show, popper, ...props }) => (
                <div
                    {...props}
                    style={{
                        position: 'absolute', padding: '2px 10px', borderRadius: 3,
                        backgroundColor: backgroundColor,
                        ...props.style,
                    }}
                >
                    <Card className="mx-2">
                        <Card.Header >Accept rotate/translate ?</Card.Header>
                        <Card.Body style={{ alignItems: 'center', alignContent: 'center', justifyContent: 'center' }}>
                            {tips}
                            <Button onClick={acceptTransform}><CheckOutlined /></Button>
                            <Button className="mx-2" onClick={rejectTransform}><CloseOutlined /></Button>
                        </Card.Body>
                    </Card>
                </div>
            )}
        </Overlay>
    </>
}



export const MoorhenAddSimpleButton = (props) => {
    const selectRef = useRef()

    const [panelParameters, setPanelParameters] = useState({
        refine: { mode: 'TRIPLE' },
        delete: { mode: 'ATOM' },
        mutate: { toType: "ALA" }
    })

    const MoorhenAddSimplePanel = (props) => {
        const molTypes = ['HOH', 'SO4', 'PO4', 'GOL', 'CIT', 'EDO']
        return <Container>
            <MenuList>
                {molTypes.map(molType => <MenuItem key={molType} onClick={() => {
                    props.typeSelected(molType)
                }}>{molType}</MenuItem>)}
            </MenuList>
            <MoorhenMoleculeSelect {...props} allowAny={false} ref={props.selectRef} />
        </Container>
    }

    const typeSelected = useCallback(value => {
        const selectedMolecule = props.molecules.find(molecule => molecule.molNo === parseInt(selectRef.current.value))
        if (selectedMolecule) {
            console.log({ selectedMolecule })
            selectedMolecule.addLigandOfType(value,
                props.glRef.current.origin.map(coord => -coord),
                props.glRef)
            props.setSelectedButtonIndex(null)
        }
    }, [props.molecules, props.glRef])

    return <MoorhenSimpleEditButton {...props}
        toolTip="Add simple"
        buttonIndex={props.buttonIndex}
        selectedButtonIndex={props.selectedButtonIndex}
        setSelectedButtonIndex={props.setSelectedButtonIndex}
        needsMapData={false}
        needsAtomData={true}
        panelParameters={panelParameters}
        prompt={<MoorhenAddSimplePanel
            {...props}
            setPanelParameters={setPanelParameters}
            panelParameters={panelParameters}
            typeSelected={typeSelected}
            selectRef={selectRef}
            awaitAtomClick={false}
        />}
        icon={<img className="baby-gru-button-icon" src={`${props.urlPrefix}/baby-gru/pixmaps/atom-at-pointer.svg`} alt='add...' />}
    />
}
