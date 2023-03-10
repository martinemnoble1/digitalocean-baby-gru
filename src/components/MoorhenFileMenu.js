import { NavDropdown, Form, Button, InputGroup, Overlay, SplitButton, Dropdown } from "react-bootstrap";
import { MoorhenMolecule } from "../utils/MoorhenMolecule";
import { MoorhenMap } from "../utils/MoorhenMap";
import { useState, useRef } from "react";
import { MoorhenImportDictionaryMenuItem, MoorhenImportMapCoefficientsMenuItem, MoorhenAutoOpenMtzMenuItem, MoorhenDeleteEverythingMenuItem, MoorhenLoadTutorialDataMenuItem, MoorhenImportMapMenuItem, MoorhenImportFSigFMenuItem, MoorhenBackupsMenuItem } from "./MoorhenMenuItem";
import { MenuItem } from "@mui/material";
import { convertViewtoPx, doDownload, readTextFile, getMultiColourRuleArgs } from "../utils/MoorhenUtils";

export const MoorhenFileMenu = (props) => {

    const { changeMolecules, changeMaps, commandCentre, glRef } = props;
    const [overlayVisible, setOverlayVisible] = useState(false)
    const [overlayContent, setOverlayContent] = useState(<></>)
    const [overlayTarget, setOverlayTarget] = useState(null)
    const [popoverIsShown, setPopoverIsShown] = useState(false)
    const [remoteSource, setRemoteSource] = useState("PDBe")
    const [isValidPdbId, setIsValidPdbId] = useState(true)
    const [storageKeysDirty, setStorageKeysDirty] = useState(true)
    const pdbCodeFetchInputRef = useRef(null);
    const fetchMapDataCheckRef = useRef(null);

    const menuItemProps = { setPopoverIsShown, ...props }

    const loadPdbFiles = async (files) => {
        let readPromises = []
        for (const file of files) {
            readPromises.push(readPdbFile(file))
        }
        let newMolecules = await Promise.all(readPromises)

        let drawPromises = []
        for (const newMolecule of newMolecules) {
            drawPromises.push(newMolecule.fetchIfDirtyAndDraw('CBs', glRef))
        }
        await Promise.all(drawPromises)

        changeMolecules({ action: "AddList", items: newMolecules })
        newMolecules.at(-1).centreOn(glRef, null, false)
    }

    const readPdbFile = (file) => {
        const newMolecule = new MoorhenMolecule(commandCentre, props.urlPrefix)
        newMolecule.setBackgroundColour(props.backgroundColor)
        newMolecule.cootBondsOptions.smoothness = props.defaultBondSmoothness
        return newMolecule.loadToCootFromFile(file)
    }

    const fetchFiles = () => {
        if (remoteSource === "PDBe") {
            fetchFilesFromEBI()
        } else if (remoteSource === "PDB-REDO") {
            fetchFilesFromPDBRedo()
        } else {
            fetchFilesFromAFDB()
        }
    }

    const fetchFilesFromEBI = () => {
        const pdbCode = pdbCodeFetchInputRef.current.value.toLowerCase()
        const coordUrl = `https://www.ebi.ac.uk/pdbe/entry-files/download/pdb${pdbCode.toLowerCase()}.ent`
        const mapUrl = `https://www.ebi.ac.uk/pdbe/entry-files/${pdbCode.toLowerCase()}.ccp4`
        const diffMapUrl = `https://www.ebi.ac.uk/pdbe/entry-files/${pdbCode.toLowerCase()}_diff.ccp4`
        if (pdbCode && fetchMapDataCheckRef.current.checked) {
            Promise.all([
                fetchMoleculeFromURL(coordUrl, pdbCode),
                fetchMapFromURL(mapUrl, `${pdbCode}-map`),
                fetchMapFromURL(diffMapUrl, `${pdbCode}-map`, true)
            ])
        } else if (pdbCode) {
            fetchMoleculeFromURL(coordUrl, pdbCode)
        }
    }

    const fetchFilesFromAFDB = () => {
        const uniprotID = pdbCodeFetchInputRef.current.value.toUpperCase()
        const coordUrl = `https://alphafold.ebi.ac.uk/files/AF-${uniprotID}-F1-model_v4.pdb`
        if (uniprotID ) {
            fetchMoleculeFromURL(coordUrl, `${uniprotID}`)
                .then(newMolecule => {
                    const newRule = [{
                        commandInput: {
                            message:'coot_command',
                            command: 'add_colour_rules_multi', 
                            returnType:'status',
                            commandArgs: getMultiColourRuleArgs(newMolecule, 'af2-plddt')
                        },
                        isMultiColourRule: true,
                        ruleType: 'af2-plddt',
                        label: `//*`
                    }]
                    newMolecule.setColourRules(glRef, newRule, false)
                })
                .catch(err => console.log(err))
        }
    }

    const fetchFilesFromPDBRedo = () => {
        const pdbCode = pdbCodeFetchInputRef.current.value.toLowerCase()
        const coordUrl = `https://pdb-redo.eu/db/${pdbCode.toLowerCase()}/${pdbCode.toLowerCase()}_final.pdb`
        const mtzUrl = `https://pdb-redo.eu/db/${pdbCode.toLowerCase()}/${pdbCode.toLowerCase()}_final.mtz/`
        if (pdbCode && fetchMapDataCheckRef.current.checked) {
            Promise.all([
                fetchMoleculeFromURL(coordUrl, `${pdbCode}-redo`),
                fetchMtzFromURL(mtzUrl, `${pdbCode}-map-redo`,  {F: "FWT", PHI: "PHWT", Fobs: 'FP', SigFobs: 'SIGFP', FreeR: 'FREE', isDifference: false, useWeight: false, calcStructFact: true}),  
                fetchMtzFromURL(mtzUrl, `${pdbCode}-map-redo`,  {F: "DELFWT", PHI: "PHDELWT", isDifference: true, useWeight: false})    
            ])
        } else if (pdbCode) {
            fetchMoleculeFromURL(coordUrl, `${pdbCode}-redo`)
        }
    }

    const fetchMoleculeFromURL = (url, molName) => {
        const newMolecule = new MoorhenMolecule(commandCentre, props.urlPrefix)
        newMolecule.setBackgroundColour(props.backgroundColor)
        newMolecule.cootBondsOptions.smoothness = props.defaultBondSmoothness
        return new Promise(async (resolve, reject) => {
            try {
                await newMolecule.loadToCootFromURL(url, molName)
                await newMolecule.fetchIfDirtyAndDraw('CBs', glRef)
                changeMolecules({ action: "Add", item: newMolecule })
                newMolecule.centreOn(glRef, null, false)
                resolve(newMolecule)
            } catch (err) {
                console.log(`Cannot fetch molecule from ${url}`)
                setIsValidPdbId(false)
                reject(err)
            }   
        })
    }

    const fetchMapFromURL = (url, mapName, isDiffMap=false) => {
        const newMap = new MoorhenMap(props.commandCentre)
        return new Promise(async () => {
            try {
                await newMap.loadToCootFromMapURL(url, mapName, isDiffMap)
                changeMaps({ action: 'Add', item: newMap })
                props.setActiveMap(newMap)
            } catch {
                console.log(`Cannot fetch map from ${url}`)
            }
        })
    }

    const fetchMtzFromURL = async (url, mapName, selectedColumns) => {
        const newMap = new MoorhenMap(props.commandCentre)
        return new Promise(async () => {
            try {
                await newMap.loadToCootFromMtzURL(url, mapName, selectedColumns)
                changeMaps({ action: 'Add', item: newMap })
                props.setActiveMap(newMap)
            } catch {
                console.log(`Cannot fetch mtz from ${url}`)
            }   
        })
    }

    const loadSessionJSON = async (sessionData) => {
        sessionData = JSON.parse(sessionData)
        console.log('Loaded the following session data...')
        console.log(sessionData)
        
        // Delete current scene
        props.molecules.forEach(molecule => {
            molecule.delete(props.glRef)
        })
        changeMolecules({ action: "Empty" })

        props.maps.forEach(map => {
            map.delete(props.glRef)
        })
        changeMaps({ action: "Empty" })

        // Load molecules stored in session from pdb string
        let newMoleculePromises = [];
        let newMolecule;
        sessionData.moleculesPdbData.forEach((pdbData, index) => {
            newMolecule = new MoorhenMolecule(commandCentre, props.urlPrefix)
            newMoleculePromises.push(
                newMolecule.loadToCootFromString(pdbData, sessionData.moleculesNames[index])
            )
        })
        let newMolecules = await Promise.all(newMoleculePromises)

        // Draw the molecules with the styles stored in session
        let drawPromises = []
        newMolecules.forEach((molecule, moleculeIndex) => {
            molecule.cootBondsOptions = sessionData.moleculesCootBondsOptions[moleculeIndex]
            const styles = sessionData.moleculesDisplayObjectsKeys[moleculeIndex]
            styles.forEach(style => drawPromises.push(molecule.fetchIfDirtyAndDraw(style, glRef)))
        })
        await Promise.all(drawPromises)
        
        // Change props.molecules
        newMolecules.forEach(molecule => {
            changeMolecules({ action: "Add", item: molecule })
        })

        // Load maps stored in session
        let newMapPromises = [];
        sessionData.mapsMapData.forEach((decodedData, index) => {
            let mapData = Uint8Array.from(Object.values(decodedData)).buffer
            let newMap = new MoorhenMap(commandCentre)
            newMapPromises.push(
                newMap.loadToCootFromMapData(mapData, sessionData.mapsNames[index], sessionData.mapsIsDifference[index])
            )
        })
        let newMaps = await Promise.all(newMapPromises)

        // Change props.maps
        newMaps.forEach(map => {
            changeMaps({ action: "Add", item: map })
        })

        // Set camera details
        glRef.current.setAmbientLightNoUpdate(...Object.values(sessionData.ambientLight))
        glRef.current.setSpecularLightNoUpdate(...Object.values(sessionData.specularLight))
        glRef.current.setDiffuseLightNoUpdate(...Object.values(sessionData.diffuseLight))
        glRef.current.setLightPositionNoUpdate(...Object.values(sessionData.lightPosition))
        glRef.current.setZoom(sessionData.zoom, false)
        glRef.current.set_fog_range(sessionData.fogStart, sessionData.fogEnd, false)
        glRef.current.set_clip_range(sessionData.clipStart, sessionData.clipEnd, false)
        glRef.current.doDrawClickedAtomLines = sessionData.doDrawClickedAtomLines
        glRef.current.atomLabelDepthMode = sessionData.atomLabelDepthMode
        glRef.current.background_colour = sessionData.backgroundColor
        glRef.current.setOrigin(sessionData.origin, false)
        glRef.current.setQuat(sessionData.quat4)

        // Set map visualisation details after map card is created using a timeout
        setTimeout(() => {
            newMaps.forEach((map, index) => {
                map.mapColour = sessionData.mapColour
                let contourOnSessionLoad = new CustomEvent("contourOnSessionLoad", {
                    "detail": {
                        molNo: map.molNo,
                        mapRadius: sessionData.mapsRadius[index],
                        cootContour: sessionData.mapsCootContours[index],
                        contourLevel: sessionData.mapsContourLevels[index],
                        mapColour: sessionData.mapsColours[index],
                        litLines: sessionData.mapsLitLines[index],
                    }
                });               
                document.dispatchEvent(contourOnSessionLoad);       
            })
        }, 2500);
    }

    const loadSession = async (file) => {
        // Load session data
        let sessionData = await readTextFile(file)
        loadSessionJSON(sessionData)
    }

    const recoverSession = async (name) => {
        console.log(`Recover .... ${name}`)
        try {
            let backup = await props.timeCapsuleRef.current.retrieveBackup(name)
            loadSessionJSON(backup)
        } catch (err) {
            console.log(err)
        }
    }

    const getSession = async (download=false, storeMaps=false) => {
        let moleculePromises = props.molecules.map(molecule => {return molecule.getAtoms()})
        let moleculeAtoms = await Promise.all(moleculePromises)
        let mapPromises = props.maps.map(map => {return map.getMap()})
        let mapData = await Promise.all(mapPromises)

        const session = {
            moleculesNames: props.molecules.map(molecule => molecule.name),
            mapsNames: storeMaps ? props.maps.map(map => map.name) : [],
            moleculesPdbData: moleculeAtoms.map(item => item.data.result.pdbData),
            mapsMapData: storeMaps ? mapData.map(item => new Uint8Array(item.data.result.mapData)) : [],
            activeMapMolNo: props.activeMap ? props.activeMap.molNo : null,
            moleculesDisplayObjectsKeys: props.molecules.map(molecule => Object.keys(molecule.displayObjects).filter(key => molecule.displayObjects[key].length > 0)),
            moleculesCootBondsOptions: props.molecules.map(molecule => molecule.cootBondsOptions),
            mapsCootContours: storeMaps ? props.maps.map(map => map.cootContour) : [],
            mapsContourLevels: storeMaps ? props.maps.map(map => map.contourLevel) : [],
            mapsColours: storeMaps ? props.maps.map(map => map.mapColour) : [],
            mapsLitLines: storeMaps ? props.maps.map(map => map.litLines) : [],
            mapsRadius: storeMaps ? props.maps.map(map => map.mapRadius) : [],
            mapsIsDifference: storeMaps ? props.maps.map(map => map.isDifference) : [],
            origin: props.glRef.current.origin,
            backgroundColor: props.backgroundColor,
            atomLabelDepthMode: props.atomLabelDepthMode,
            ambientLight: glRef.current.light_colours_ambient,
            diffuseLight: glRef.current.light_colours_diffuse,
            lightPosition: glRef.current.light_positions,
            specularLight: glRef.current.light_colours_specular,
            fogStart: glRef.current.gl_fog_start,
            fogEnd: glRef.current.gl_fog_end,
            zoom: glRef.current.zoom,
            doDrawClickedAtomLines: glRef.current.doDrawClickedAtomLines,
            clipStart: (glRef.current.gl_clipPlane0[3] + 500) * -1,
            clipEnd: glRef.current.gl_clipPlane1[3] - 500,
            quat4: glRef.current.myQuat
        }
        
        const sessionString = JSON.stringify(session)

        if(download) {
            doDownload([sessionString], `session.json`)
        } else {
            try {
                props.timeCapsuleRef.current.busy = true
                await props.timeCapsuleRef.current.createBackup(sessionString)
                setStorageKeysDirty(true)
            } catch (err) {
                console.log(err)
            }
        }
    }

    return <>
        <NavDropdown
            title="File"
            id="file-nav-dropdown"
            autoClose={popoverIsShown ? false : 'outside'}
            show={props.currentDropdownId === props.dropdownId}
            style={{display:'flex', alignItems:'center'}}
            onToggle={() => { props.dropdownId !== props.currentDropdownId ? props.setCurrentDropdownId(props.dropdownId) : props.setCurrentDropdownId(-1) }}>
                <div style={{maxHeight: convertViewtoPx(65, props.windowHeight), overflowY: 'auto'}}>
                    <Form.Group style={{ width: '20rem', margin: '0.5rem' }} controlId="upload-coordinates-form" className="mb-3">
                        <Form.Label>Coordinates</Form.Label>
                        <Form.Control type="file" accept=".pdb, .mmcif, .cif, .ent" multiple={true} onChange={(e) => { loadPdbFiles(e.target.files) }}/>
                    </Form.Group>
                    <Form.Group style={{ width: '20rem', margin: '0.5rem' }} controlId="fetch-pdbe-form" className="mb-3">
                        <Form.Label>Fetch coords from online services</Form.Label>
                        <InputGroup>
                            <SplitButton title={remoteSource} id="fetch-coords-online-source-select">
                                <Dropdown.Item key="PDBe" href="#" onClick={() => {
                                    setRemoteSource("PDBe")
                                }}>PDBe</Dropdown.Item>
                                <Dropdown.Item key="PDB-REDO" href="#" onClick={() => {
                                    setRemoteSource("PDB-REDO")
                                }}>PDB-REDO</Dropdown.Item>
                                <Dropdown.Item key="AFDB" href="#" onClick={() => {
                                    setRemoteSource("AFDB")
                                }}>AlphaFold DB</Dropdown.Item>
                            </SplitButton>
                            <Form.Control type="text" style={{borderColor: isValidPdbId ? '' : 'red'}}  ref={pdbCodeFetchInputRef} onKeyDown={(e) => {
                                setIsValidPdbId(true)
                                if (e.code === 'Enter') {
                                    fetchFiles()
                                }
                            }}/>
                            <Button variant="light" onClick={fetchFiles}>
                                Fetch
                            </Button>
                        </InputGroup>
                        <Form.Label style={{display: isValidPdbId ? 'none' : 'block', alignContent: 'center' ,textAlign: 'center'}}>Problem fetching</Form.Label>
                        <Form.Check style={{ marginTop: '0.5rem' }} ref={fetchMapDataCheckRef} label={'fetch map data'} name={`fetchMapData`} type="checkbox" variant="outline" />
                    </Form.Group>
                    <Form.Group style={{ width: '20rem', margin: '0.5rem' }} controlId="upload-session-form" className="mb-3">
                        <Form.Label>Load from stored session</Form.Label>
                        <Form.Control type="file" accept=".json" multiple={false} onChange={(e) => { loadSession(e.target.files[0]) }}/>
                    </Form.Group>

                    <hr></hr>

                    <MoorhenAutoOpenMtzMenuItem {...menuItemProps} />
                    
                    <MoorhenImportMapCoefficientsMenuItem {...menuItemProps} />

                    <MoorhenImportFSigFMenuItem {...menuItemProps} />

                    <MoorhenImportMapMenuItem {...menuItemProps} />

                    <MoorhenImportDictionaryMenuItem {...menuItemProps} />

                    <MoorhenLoadTutorialDataMenuItem {...menuItemProps} />

                    <MenuItem id='download-session-menu-item' variant="success" onClick={() => {getSession(true, true)}}>
                        Download session
                    </MenuItem>

                    <MenuItem id='save-session-menu-item' variant="success" onClick={() => {getSession()}}>
                        Store molecule backup
                    </MenuItem>
                    
                    <MoorhenBackupsMenuItem {...menuItemProps} timeCapsuleRef={props.timeCapsuleRef} storageKeysDirty={storageKeysDirty} setStorageKeysDirty={setStorageKeysDirty} onCompleted={(e) => { recoverSession(e)}} />
                    
                    <hr></hr>

                    <MoorhenDeleteEverythingMenuItem {...menuItemProps} />
                </div>
        </NavDropdown>



        <Overlay
            target={overlayTarget}
            show={overlayVisible}
            placement={"right"}
        >
            {({ placement, arrowProps, show: _show, popper, ...props }) => (
                <div
                    {...props}
                    style={{
                        position: 'absolute',
                        marginBottom: '0.5rem',
                        marginLeft: '1rem',
                        borderRadius: 3,
                        ...props.style,
                    }}
                >{overlayContent}
                </div>
            )}
        </Overlay>
    </>
}
