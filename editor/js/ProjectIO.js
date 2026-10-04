import * as THREE from 'three';

import {
	zipSync,
	unzipSync,
	strToU8,
	strFromU8
} from 'three/addons/libs/fflate.module.js';

const FORMAT_NAME = '3EXR';
const FORMAT_VERSION = 1;

class ProjectIO {

	constructor( editor ) {

		this.editor = editor;

		this.fileHandle = null;
		this.projectName = null;
		this.createdAt = null;

	}

	reset() {

		this.fileHandle = null;
		this.projectName = null;
		this.createdAt = null;

		this.editor.config.setKey( 'project/title', '' );

	}

	getProjectName() {

		const title = this.editor.config.getKey( 'project/title' );

		if (
			typeof title === 'string' &&
title.trim() !== ''
		) {

			return title.trim();

		}

		if ( this.projectName ) {

			return this.projectName;

		}

		return 'Untitled';

	}

	stripExtension( filename ) {

		const lower = filename.toLowerCase();

		if ( lower.endsWith( '.3exr' ) ) {

			return filename.slice( 0, - 5 );

		}

		return filename;

	}

	safeFilename( name ) {

		let safe = name;

		for ( const character of '<>:"/\\|?*' ) {

			safe = safe.split( character ).join( '_' );

		}

		safe = safe.trim();

		return safe || 'Untitled';

	}

	createManifest() {

		const now = new Date().toISOString();

		const assetEntries = this.editor.assetStore.getManifestEntries();
		const assetStats = this.editor.assetStore.getStats();

		if ( this.createdAt === null ) {

			this.createdAt = now;

		}

		return {

			format: FORMAT_NAME,
			formatVersion: FORMAT_VERSION,

			generator: {
				name: '3EXR',
				release: 'R2',
				threeRevision: THREE.REVISION
			},

			project: {
				name: this.getProjectName()
			},

			createdAt: this.createdAt,
			modifiedAt: now,

			files: {
				editor: 'scene.json'
			},

			assets: {
				version: 1,
				count: assetStats.count,
				totalSize: assetStats.totalSize,
				entries: assetEntries
			}

		};

	}

	createPackage() {

		const manifest = this.createManifest();
		const editorData = this.editor.toJSON();

		const packageFiles = {

			'manifest.json': strToU8(
				JSON.stringify( manifest, null, 2 )
			),

			'scene.json': strToU8(
				JSON.stringify( editorData, null, 2 )
			)

		};

		Object.assign(
			packageFiles,
			this.editor.assetStore.getPackageFiles()
		);

		const stats = this.editor.assetStore.getStats();

		console.log(
			'3EXR Project:',
			'packaging',
			stats.count,
			'assets,',
			stats.totalSize,
			'bytes'
		);

		return zipSync(
			packageFiles,
			{
				level: 6
			}
		);

	}

	async open() {

		let file = null;
		let handle = null;

		if ( 'showOpenFilePicker' in window ) {

			try {

				const handles = await window.showOpenFilePicker( {
					multiple: false,
					types: [
						{
							description: '3EXR Project',
							accept: {
								'application/octet-stream': [ '.3exr' ]
							}
						}
					]
				} );

				handle = handles[ 0 ];
				file = await handle.getFile();

			} catch ( error ) {

				if ( error.name === 'AbortError' ) {

					return false;

				}

				throw error;

			}

		} else {

			file = await this.openWithInput();

		}

		if ( file === null ) {

			return false;

		}

		await this.loadFile( file, handle );

		return true;

	}

	openWithInput() {

		return new Promise( resolve => {

			const input = document.createElement( 'input' );

			input.type = 'file';
			input.accept = '.3EXR,.3exr';
			input.style.display = 'none';

			const cleanup = function () {

				input.remove();

			};

			input.addEventListener( 'change', function () {

				const file =
input.files &&
input.files.length > 0
	? input.files[ 0 ]
	: null;

				cleanup();
				resolve( file );

			}, { once: true } );

			input.addEventListener( 'cancel', function () {

				cleanup();
				resolve( null );

			}, { once: true } );

			document.body.appendChild( input );
			input.click();

		} );

	}

	async loadFile( file, handle = null ) {

		const contents = await file.arrayBuffer();

		let zip;

		try {

			zip = unzipSync(
				new Uint8Array( contents )
			);

		} catch ( error ) {

			throw new Error(
				'Invalid 3EXR container.',
				{ cause: error }
			);

		}

		if (
			zip[ 'manifest.json' ] === undefined ||
zip[ 'scene.json' ] === undefined
		) {

			throw new Error(
				'3EXR project is missing required files.'
			);

		}

		const manifest = JSON.parse(
			strFromU8( zip[ 'manifest.json' ] )
		);

		if ( manifest.format !== FORMAT_NAME ) {

			throw new Error(
				'File is not a 3EXR project.'
			);

		}

		if (
			typeof manifest.formatVersion !== 'number' ||
manifest.formatVersion > FORMAT_VERSION
		) {

			throw new Error(
				'Unsupported 3EXR project version.'
			);

		}

		const editorData = JSON.parse(
			strFromU8( zip[ 'scene.json' ] )
		);

		this.editor.clear();

		this.editor.assetStore.restoreFromPackage(
			manifest.assets?.entries || [],
			zip
		);

		await this.editor.fromJSON(
			editorData
		);

		this.fileHandle = handle;

		this.projectName =
manifest.project?.name ||
this.stripExtension( file.name );

		this.createdAt =
manifest.createdAt ||
new Date().toISOString();

		this.editor.config.setKey(
			'project/title',
			this.projectName
		);

	}

	async save() {

		if (
			this.fileHandle &&
typeof this.fileHandle.createWritable === 'function'
		) {

			const data = this.createPackage();

			await this.writeHandle(
				this.fileHandle,
				data
			);

			return true;

		}

		return this.saveAs();

	}

	async saveAs() {

		const filename =
this.safeFilename(
	this.getProjectName()
) + '.3EXR';

		if ( 'showSaveFilePicker' in window ) {

			let handle;

			try {

				handle = await window.showSaveFilePicker( {
					suggestedName: filename,

					types: [
						{
							description: '3EXR Project',
							accept: {
								'application/octet-stream': [ '.3exr' ]
							}
						}
					]
				} );

			} catch ( error ) {

				if ( error.name === 'AbortError' ) {

					return false;

				}

				throw error;

			}

			this.fileHandle = handle;

			this.projectName =
this.stripExtension(
	handle.name
);

			if (
				! this.editor.config.getKey(
					'project/title'
				)
			) {

				this.editor.config.setKey(
					'project/title',
					this.projectName
				);

			}

			const data = this.createPackage();

			await this.writeHandle(
				handle,
				data
			);

			return true;

		}

		// Browser fallback: normal download.

		const data = this.createPackage();

		const blob = new Blob(
			[ data ],
			{
				type: 'application/octet-stream'
			}
		);

		this.editor.utils.save(
			blob,
			filename
		);

		return true;

	}

	async writeHandle( handle, data ) {

		const writable =
await handle.createWritable();

		try {

			await writable.write( data );

		} finally {

			await writable.close();

		}

	}

}

export { ProjectIO };
