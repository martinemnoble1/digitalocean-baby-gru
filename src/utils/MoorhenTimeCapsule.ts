import { MoorhenMoleculeInterface, cootBondOptionsType } from "./MoorhenMolecule"
import { MoorhenMapInterface, selectedColumnsType } from "./MoorhenMap"
import { WorkerResponseType } from "./MoorhenCommandCentre";

export interface backupKeyInterface {
    name?: string;
    label?: string;
    dateTime: string;
    type: string;
    molNames: string[];
    mapNames?: string[];
    mtzNames?: string[];
}

type moleculeSessionDataType = {
    name: string;
    molNo: number;
    pdbData: string;
    displayObjectsKeys: string[];
    cootBondsOptions: cootBondOptionsType;
    connectedToMaps: number[];
}

type mapDataSessionType = {
    name: string;
    molNo: number;
    uniqueId: string;
    mapData: Uint8Array;
    reflectionData: Uint8Array;
    cootContour: boolean;
    contourLevel: number;
    radius: number;
    colour: [number, number, number, number];
    litLines: boolean;
    isDifference: boolean;
    selectedColumns: selectedColumnsType;
    hasReflectionData: boolean;
    associatedReflectionFileName: string;
}

export type backupSessionType = {
    includesAdditionalMapData: boolean;
    moleculeData: moleculeSessionDataType[];
    mapData: mapDataSessionType[];
    activeMapIndex: number;
    origin: [number, number, number];
    backgroundColor: [number, number, number, number];
    atomLabelDepthMode: boolean;
    ambientLight: [number, number, number, number];
    diffuseLight: [number, number, number, number];
    lightPosition: [number, number, number, number];
    specularLight: [number, number, number, number];
    fogStart: number;
    fogEnd: number;
    zoom: number;
    doDrawClickedAtomLines: boolean;
    clipStart: number;
    clipEnd: number;
    quat4: any[];
}

export interface MoorhenTimeCapsuleInterface {
    getSortedKeys(): Promise<backupKeyInterface[]>;
    cleanupUnusedDataFiles(): Promise<void>;
    removeBackup(key: string): Promise<void>;
    updateDataFiles(): Promise<(string | void)[]>;
    createBackup(keyString: string, sessionString: string): Promise<string>;
    fetchSession(arg0: boolean): Promise<backupSessionType>;
    moleculesRef: React.RefObject<MoorhenMoleculeInterface[]>;
    mapsRef: React.RefObject<MoorhenMapInterface[]>;
    glRef: React.RefObject<mgWebGLType>;
    activeMapRef: React.RefObject<MoorhenMapInterface>;
    preferences: any;
    busy: boolean;
    modificationCount: number;
    modificationCountBackupThreshold: number;
    maxBackupCount: number;
    version: string;
    disableBackups: boolean;
    storageInstance: LocalStorageInstanceInterface;
    addModification: () =>  Promise<string>;
    init: () => Promise<void>;
    retrieveBackup: (arg0: string) => Promise<string | ArrayBuffer>;
}


export interface LocalStorageInstanceInterface {
    clear: () => Promise<void>;
    keys: () => Promise<string[]>;
    setItem: (key: string, value: string) => Promise<string>;
    removeItem: (key: string) => Promise<void>;
    getItem: (key: string) => Promise<string>;
}

export const getBackupLabel = (key: backupKeyInterface): string => {
    const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' } as const
    const intK: number = parseInt(key.dateTime)
    const date: Date = new Date(intK)
    const dateString = `${date.toLocaleDateString(Intl.NumberFormat().resolvedOptions().locale, dateOptions)} ${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}`
    const moleculeNamesLabel: string = key.molNames.join(',').length > 10 ? key.molNames.join(',').slice(0, 8) + "..." : key.molNames.join(',')
    return `${moleculeNamesLabel} -- ${dateString} -- ${key.type === 'automatic' ? 'AUTO' : 'MANUAL'}`
}

export class MoorhenTimeCapsule implements MoorhenTimeCapsuleInterface {

    moleculesRef: React.RefObject<MoorhenMoleculeInterface[]>;
    mapsRef: React.RefObject<MoorhenMapInterface[]>;
    glRef: React.RefObject<mgWebGLType>;
    activeMapRef: React.RefObject<MoorhenMapInterface>;
    preferences: any;
    busy: boolean;
    modificationCount: number;
    modificationCountBackupThreshold: number;
    maxBackupCount: number;
    version: string;
    disableBackups: boolean;
    storageInstance: LocalStorageInstanceInterface;
    
    constructor(moleculesRef: React.RefObject<MoorhenMoleculeInterface[]>, mapsRef: React.RefObject<MoorhenMapInterface[]>, activeMapRef: React.RefObject<MoorhenMapInterface>, glRef: React.RefObject<mgWebGLType>, preferences: any) {
        this.moleculesRef = moleculesRef
        this.mapsRef = mapsRef
        this.glRef = glRef
        this.activeMapRef = activeMapRef
        this.preferences = preferences
        this.busy = false
        this.modificationCount = 0
        this.modificationCountBackupThreshold = 5
        this.maxBackupCount = 10
        this.version = 'v8'
        this.disableBackups = false
        this.storageInstance = null    
    }

    init(): Promise<void> {
        if (this.storageInstance) {
            return this.checkVersion()
        } else {
            console.log('Time capsule storage instance has not been defined! Backups will be disabled...')
            this.disableBackups = true
        }
    }

    async checkVersion(): Promise<void> {
        const keyString = JSON.stringify({type: 'version'})
        const storedVersion = await this.storageInstance.getItem(keyString)
        if (!storedVersion || this.version !== storedVersion) {
            await this.storageInstance.clear()
            await this.storageInstance.setItem(keyString, this.version)
        }
    }

    async updateDataFiles(): Promise<(string | void)[]> {
        const allKeyStrings = await this.storageInstance.keys()
        const allKeys: backupKeyInterface[] = allKeyStrings.map((keyString: string) => JSON.parse(keyString))
        const currentMtzFiles = allKeys.filter((key: backupKeyInterface) => key.type === 'mtzData').map(key => key.name)
        const currentMapData = allKeys.filter((key: backupKeyInterface) => key.type === 'mapData').map(key => key.name)

        let promises: Promise<string | void>[] = []
        this.mapsRef.current.map(async (map: MoorhenMapInterface) => {
            const fileName = map.associatedReflectionFileName
            if (fileName && !currentMtzFiles.includes(fileName)) {
                const key = JSON.stringify({type: 'mtzData', name: fileName})
                promises.push(
                    map.fetchReflectionData().then(reflectionData => {
                        this.createBackup(key, reflectionData.data.result.mtzData)
                    })    
                )
            }
            if (map.uniqueId && !currentMapData.includes(map.uniqueId)) {
                const key = JSON.stringify({type: 'mapData', name: map.uniqueId})
                promises.push(
                    map.getMap().then(mapData => {
                        this.createBackup(key, mapData.data.result.mapData)
                    })
                )
            }
        })
        
        return Promise.all(promises)
    }

    async fetchSession (includeAdditionalMapData: boolean = true): Promise<backupSessionType> {
        this.busy = true
        const keyStrings = await this.storageInstance.keys()
        const mtzFileNames = keyStrings.map((keyString: string) => JSON.parse(keyString)).filter((key: backupKeyInterface) => key.type === 'mtzData').map((key: backupKeyInterface) => key.name)
        const mapNames = keyStrings.map((keyString: string) => JSON.parse(keyString)).filter((key: backupKeyInterface) => key.type === 'mapData').map((key: backupKeyInterface) => key.name)
        
        const promises = await Promise.all([
            ...this.moleculesRef.current.map(molecule => {return molecule.getAtoms()}), 
            ...this.mapsRef.current.map(map => {
                if (!includeAdditionalMapData) {
                    return Promise.resolve('map_data')
                } else if (mapNames.includes(map.uniqueId)) {
                    return this.retrieveBackup(
                        JSON.stringify({
                            type: 'mapData',
                            name: map.uniqueId
                        })
                    ).then(result => {return {data: {message: 'get_map', result: {mapData: result}}}})
                } else {
                    return map.getMap()
                }
            }),
            ...this.mapsRef.current.map(map => {
                if (!map.hasReflectionData || !includeAdditionalMapData) { 
                    return Promise.resolve('reflection_data')
                } else if (mtzFileNames.includes(map.associatedReflectionFileName)) {
                    return this.retrieveBackup(
                        JSON.stringify({
                            type: 'mtzData',
                            name: map.associatedReflectionFileName
                        })
                    ).then(result => {return {data: {message: 'get_mtz_data', result: {mtzData: result}}}})
                } else {
                    return map.fetchReflectionData()
                }
            })
        ])

        let moleculeDataPromises: string[] = []
        let mapDataPromises: Uint8Array[] = []
        let reflectionDataPromises: Uint8Array[] = []
        promises.forEach((promise: string | WorkerResponseType) => {
            if (typeof promise === "string" && promise === 'reflection_data') {
                reflectionDataPromises.push(null)
            } else if (promise === 'map_data') {
                mapDataPromises.push(null)
            } else if (typeof promise === "object" && promise.data.message === "get_mtz_data") {
                reflectionDataPromises.push(promise.data.result.mtzData)
            }else if (typeof promise === "object" && promise.data.message === 'get_atoms') {
                moleculeDataPromises.push(promise.data.result.pdbData)
            } else if (typeof promise === "object" && promise.data.message === 'get_map') {
                mapDataPromises.push(new Uint8Array(promise.data.result.mapData))
            } else {
                console.log(`Unrecognised promise type when fetching session... ${promise}`)
            }
        })

        const moleculeData: moleculeSessionDataType[] = this.moleculesRef.current.map((molecule, index) => {
            return {
                name: molecule.name,
                molNo: molecule.molNo,
                pdbData: moleculeDataPromises[index],
                displayObjectsKeys: Object.keys(molecule.displayObjects).filter(key => molecule.displayObjects[key].length > 0),
                cootBondsOptions: molecule.cootBondsOptions,
                connectedToMaps: molecule.connectedToMaps
            }
        })

        const mapData: mapDataSessionType[] = this.mapsRef.current.map((map, index) => {
            return {
                name: map.name,
                molNo: map.molNo,
                uniqueId: map.uniqueId,
                mapData: mapDataPromises[index],
                reflectionData: reflectionDataPromises[index],
                cootContour: map.cootContour,
                contourLevel: map.contourLevel,
                radius: map.mapRadius,
                colour: map.mapColour,
                litLines: map.litLines,
                isDifference: map.isDifference,
                selectedColumns: map.selectedColumns,
                hasReflectionData: map.hasReflectionData,
                associatedReflectionFileName: map.associatedReflectionFileName
            }
        })

        const session: backupSessionType = {
            includesAdditionalMapData: includeAdditionalMapData,
            moleculeData: moleculeData,
            mapData: mapData,
            activeMapIndex: this.mapsRef.current.findIndex(map => map.molNo === this.activeMapRef.current.molNo),
            origin: this.glRef.current.origin,
            backgroundColor: this.glRef.current.background_colour,
            atomLabelDepthMode: this.preferences.atomLabelDepthMode,
            ambientLight: this.glRef.current.light_colours_ambient,
            diffuseLight: this.glRef.current.light_colours_diffuse,
            lightPosition: this.glRef.current.light_positions,
            specularLight: this.glRef.current.light_colours_specular,
            fogStart: this.glRef.current.gl_fog_start,
            fogEnd: this.glRef.current.gl_fog_end,
            zoom: this.glRef.current.zoom,
            doDrawClickedAtomLines: this.glRef.current.doDrawClickedAtomLines,
            clipStart: (this.glRef.current.gl_clipPlane0[3] + this.glRef.current.fogClipOffset) * -1,
            clipEnd: this.glRef.current.gl_clipPlane1[3] - this.glRef.current.fogClipOffset,
            quat4: this.glRef.current.myQuat
        }

        return session
    }

    async addModification(): Promise<string> {
        this.modificationCount += 1
        if (this.modificationCount >= this.modificationCountBackupThreshold && !this.disableBackups) {
            this.busy = true
            this.modificationCount = 0
            
            await this.updateDataFiles()
            const session: backupSessionType = await this.fetchSession(false)
            const sessionString: string = JSON.stringify(session)
            
            const key: backupKeyInterface = {
                dateTime: `${Date.now()}`, 
                type: 'automatic', 
                molNames: this.moleculesRef.current.map(mol => mol.name),
                mapNames: this.mapsRef.current.map(map => map.uniqueId),
                mtzNames: this.mapsRef.current.filter(map => map.hasReflectionData).map(map => map.associatedReflectionFileName)
            }
            
            const keyString: string = JSON.stringify({
                ...key,
                label: getBackupLabel(key)
            })

            return this.createBackup(keyString, sessionString)
        }
    }

    async cleanupIfFull(): Promise<void> {
        const keyStrings: string[] = await this.storageInstance.keys()
        const keys: backupKeyInterface[] = keyStrings.map((keyString: string) => JSON.parse(keyString)).filter(key => key.type === 'automatic')
        const sortedKeys = keys.sort((a, b) => { return parseInt(a.dateTime) - parseInt(b.dateTime) }).reverse()
        if (sortedKeys.length - 1 >= this.maxBackupCount) {
            const toRemoveCount = sortedKeys.length - this.maxBackupCount
            const promises = sortedKeys.slice(-toRemoveCount).map(key => this.removeBackup(JSON.stringify(key)))
            await Promise.all(promises)
        }
    }

    async cleanupUnusedDataFiles(): Promise<void> {
        const allKeyStrings = await this.storageInstance.keys()
        const allKeys: backupKeyInterface[] = allKeyStrings.map((keyString: string) => JSON.parse(keyString))
        const backupKeys = allKeys.filter((key: backupKeyInterface) => ['automatic', 'manual'].includes(key.type))
        const [ usedNames ] = [ ...backupKeys.map((key: backupKeyInterface) => [...key.mtzNames, ...key.mapNames]) ]

        await Promise.all(allKeys.filter((key: backupKeyInterface) => ['mtzData', 'mapData'].includes(key.type)).map((key: backupKeyInterface) => {
            if (typeof usedNames === 'undefined' || !usedNames.includes(key.name)) {
                return this.removeBackup(JSON.stringify(key))
            }
            return Promise.resolve()
        }))
    }

    async createBackup(key: string, value: string): Promise<string> {
        if (!this.disableBackups) {
            try {
                await this.storageInstance.setItem(key, value)
                await this.cleanupIfFull()
                this.busy = false
                return key
            } catch (err) {
                console.log(err)
            }   
        }
    }

    async retrieveBackup(key: string): Promise<string | ArrayBuffer> {
        try {
            return await this.storageInstance.getItem(key)
        } catch (err) {
            console.log(err)
        }
    }

    async retrieveLastBackup(): Promise<string | ArrayBuffer> {
        try {
            const sortedKeys = await this.getSortedKeys()
            if (sortedKeys && sortedKeys.length > 0) {
                const lastBackupKey = sortedKeys[sortedKeys.length - 1]
                const backup = await this.retrieveBackup(JSON.stringify(lastBackupKey))
                return backup    
            }
        } catch (err) {
            console.log(err)
        }
    }

    async removeBackup(key: string): Promise<void> {
        try {
            await this.storageInstance.removeItem(key)
        } catch (err) {
            console.log(err)
        }
    }

    async dropAllBackups(): Promise<void> {
        try {
            await this.storageInstance.clear()
            await this.storageInstance.setItem(JSON.stringify({type: 'version'}), this.version)
        } catch (err) {
            console.log(err)
        }
    }

    async getSortedKeys(): Promise<backupKeyInterface[]> {
        const keyStrings = await this.storageInstance.keys()
        const keys: backupKeyInterface[] = keyStrings.map((keyString: string) => JSON.parse(keyString)).filter(key => ['automatic', 'manual'].includes(key.type))
        const sortedKeys = keys.sort((a, b) => { return parseInt(a.dateTime) - parseInt(b.dateTime) }).reverse()
        return sortedKeys
    }
}
