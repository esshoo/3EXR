const MODEL_EXTENSIONS = new Set( [
	'3dm', '3ds', '3mf', 'amf', 'dae', 'drc',
	'fbx', 'glb', 'gltf', 'ldr', 'md2', 'mpd',
	'obj', 'pcd', 'ply', 'stl', 'usd', 'usda',
	'usdc', 'usdz', 'vox', 'wrl', 'xyz'
] );

const IMAGE_EXTENSIONS = new Set( [
	'bmp', 'exr', 'gif', 'hdr', 'jpeg', 'jpg',
	'ktx2', 'pic', 'png', 'tga', 'webp'
] );

const AUDIO_EXTENSIONS = new Set( [
	'aac', 'flac', 'm4a', 'mp3', 'ogg', 'opus', 'wav'
] );

const VIDEO_EXTENSIONS = new Set( [
	'm4v', 'mkv', 'mov', 'mp4', 'ogv', 'webm'
] );

const FONT_EXTENSIONS = new Set( [
	'otf', 'ttf', 'woff', 'woff2'
] );

class AssetStore {

	constructor() {

		this.clear();

	}

	clear() {

		if (
			this.objectURLs &&
			globalThis.URL &&
			typeof globalThis.URL.revokeObjectURL === 'function'
		) {

			for ( const url of this.objectURLs ) {

				globalThis.URL.revokeObjectURL( url );

			}

		}

		this.assets = new Map();
		this.hashIndex = new Map();
		this.objectURLs = new Set();

	}

	getAsset( id ) {

		return this.assets.get( id ) || null;

	}

	hasAsset( id ) {

		return this.assets.has( id );

	}

	getBytes( id ) {

		const asset = this.getAsset( id );

		return asset ? asset.bytes : null;

	}

	getBlob( id ) {

		const asset = this.getAsset( id );

		if (
			asset === null ||
			typeof Blob === 'undefined'
		) {

			return null;

		}

		return new Blob(
			[ asset.bytes ],
			{
				type: asset.mimeType || 'application/octet-stream'
			}
		);

	}

	createObjectURL( id ) {

		const blob = this.getBlob( id );

		if (
			blob === null ||
			! globalThis.URL ||
			typeof globalThis.URL.createObjectURL !== 'function'
		) {

			return null;

		}

		const url = globalThis.URL.createObjectURL( blob );

		this.objectURLs.add( url );

		return url;

	}

	revokeObjectURL( url ) {

		if (
			typeof url !== 'string' ||
			! this.objectURLs.has( url )
		) {

			return false;

		}

		if (
			globalThis.URL &&
			typeof globalThis.URL.revokeObjectURL === 'function'
		) {

			globalThis.URL.revokeObjectURL( url );

		}

		this.objectURLs.delete( url );

		return true;

	}

	findByHash( hash ) {

		return this.hashIndex.get( hash ) || null;

	}

	findBySourcePath( value ) {

		const path = this.normalizePath( value );

		if ( path === '' ) return null;

		for ( const record of this.assets.values() ) {

			if (
				this.normalizePath( record.sourcePath ) === path
			) {

				return record.id;

			}

			for ( const alias of record.aliases || [] ) {

				if (
					this.normalizePath( alias ) === path
				) {

					return record.id;

				}

			}

		}

		return null;

	}

	linkTarget( target, assetId ) {

		if (
			! target ||
			! assetId ||
			! this.hasAsset( assetId )
		) {

			return false;

		}

		if (
			! target.userData ||
			typeof target.userData !== 'object' ||
			Array.isArray( target.userData )
		) {

			target.userData = {};

		}

		const current = target.userData.__3exr;

		const metadata =
			current &&
			typeof current === 'object' &&
			! Array.isArray( current )
				? { ... current }
				: {};

		metadata.version = 1;
		metadata.sourceAssetId = assetId;

		target.userData.__3exr = metadata;

		return true;

	}

	linkObject( object, assetId ) {

		return this.linkTarget( object, assetId );

	}

	linkTexture( texture, assetId ) {

		return this.linkTarget( texture, assetId );

	}

	getLinkedAssetId( target ) {

		const id =
			target?.userData?.__3exr?.sourceAssetId;

		return typeof id === 'string'
			? id
			: null;

	}

	normalizePath( value ) {

		let path = String( value || '' ).replace( /\\/g, '/' );

		while ( path.startsWith( './' ) ) {

			path = path.slice( 2 );

		}

		while ( path.startsWith( '/' ) ) {

			path = path.slice( 1 );

		}

		return path.normalize( 'NFC' );

	}

	getExtension( name ) {

		const parts = String( name || '' ).toLowerCase().split( '.' );

		return parts.length > 1
			? parts.pop()
			: '';

	}

	getKind( file ) {

		const extension = this.getExtension( file.name );
		const mime = file.type || '';

		if ( MODEL_EXTENSIONS.has( extension ) ) return 'model';
		if ( IMAGE_EXTENSIONS.has( extension ) || mime.startsWith( 'image/' ) ) return 'image';
		if ( AUDIO_EXTENSIONS.has( extension ) || mime.startsWith( 'audio/' ) ) return 'audio';
		if ( VIDEO_EXTENSIONS.has( extension ) || mime.startsWith( 'video/' ) ) return 'video';
		if ( FONT_EXTENSIONS.has( extension ) || mime.startsWith( 'font/' ) ) return 'font';

		if (
			extension === 'json' ||
extension === 'js' ||
extension === 'txt' ||
extension === 'csv'
		) {

			return 'data';

		}

		return 'other';

	}

	getFolder( kind ) {

		switch ( kind ) {

			case 'model': return 'models';
			case 'image': return 'images';
			case 'audio': return 'audio';
			case 'video': return 'video';
			case 'font': return 'fonts';
			case 'data': return 'data';
			default: return 'other';

		}

	}

	safeName( name ) {

		let value = String( name || 'asset' );

		for ( const character of '<>:"/\\|?*' ) {

			value = value.split( character ).join( '_' );

		}

		return value.trim() || 'asset';

	}

	async hashBytes( bytes ) {

		if (
			globalThis.crypto &&
globalThis.crypto.subtle
		) {

			const digest = await globalThis.crypto.subtle.digest(
				'SHA-256',
				bytes
			);

			const values = new Uint8Array( digest );

			let result = '';

			for ( const value of values ) {

				result += value.toString( 16 ).padStart( 2, '0' );

			}

			return 'sha256:' + result;

		}

		let hash = 0x811c9dc5;

		for ( let i = 0; i < bytes.length; i ++ ) {

			hash ^= bytes[ i ];
			hash = Math.imul( hash, 0x01000193 ) >>> 0;

		}

		return 'fnv1a32:' + hash.toString( 16 ).padStart( 8, '0' );

	}

	async registerFile( file, sourcePath = null ) {

		if ( ! file ) return null;

		const normalizedSourcePath = this.normalizePath(
			sourcePath ||
file.webkitRelativePath ||
file.name
		);

		const bytes = new Uint8Array(
			await file.arrayBuffer()
		);

		const hash = await this.hashBytes( bytes );

		if ( this.hashIndex.has( hash ) ) {

			const id = this.hashIndex.get( hash );
			const existing = this.assets.get( id );

			if (
				normalizedSourcePath &&
! existing.aliases.includes( normalizedSourcePath )
			) {

				existing.aliases.push( normalizedSourcePath );

			}

			return id;

		}

		const hashValue = hash.split( ':' )[ 1 ];
		const id = 'asset_' + hashValue.slice( 0, 16 );

		const kind = this.getKind( file );
		const folder = this.getFolder( kind );
		const name = file.name || 'asset';
		const extension = this.getExtension( name );

		const archivePath =
'assets/' +
folder +
'/' +
id +
'_' +
this.safeName( name );

		const record = {

			id,
			name,
			kind,
			extension,

			mimeType:
file.type ||
'application/octet-stream',

			size: bytes.byteLength,

			lastModified:
Number( file.lastModified ) || 0,

			sourcePath:
normalizedSourcePath ||
name,

			aliases: normalizedSourcePath
				? [ normalizedSourcePath ]
				: [],

			archivePath,
			hash,
			bytes

		};

		this.assets.set( id, record );
		this.hashIndex.set( hash, id );

		console.log(
			'3EXR AssetStore:',
			'registered',
			name,
			'->',
			id
		);

		return id;

	}

	async registerFiles( files, filesMap = null ) {

		const list = Array.from( files || [] );
		const reversePaths = new Map();

		if ( filesMap ) {

			for ( const path in filesMap ) {

				const file = filesMap[ path ];

				if (
					file &&
! reversePaths.has( file )
				) {

					reversePaths.set(
						file,
						this.normalizePath( path )
					);

				}

			}

		}

		const result = [];

		for ( const file of list ) {

			const sourcePath =
reversePaths.get( file ) ||
file.webkitRelativePath ||
file.name;

			result.push(
				await this.registerFile(
					file,
					sourcePath
				)
			);

		}

		return result;

	}

	getManifestEntries() {

		return Array.from( this.assets.values() )
			.map( record => ( {

				id: record.id,
				name: record.name,
				kind: record.kind,
				extension: record.extension,
				mimeType: record.mimeType,
				size: record.size,
				lastModified: record.lastModified,
				sourcePath: record.sourcePath,
				aliases: [ ... record.aliases ],
				archivePath: record.archivePath,
				hash: record.hash

			} ) )
			.sort( function ( a, b ) {

				return a.archivePath.localeCompare(
					b.archivePath
				);

			} );

	}

	getPackageFiles() {

		const files = {};

		for ( const record of this.assets.values() ) {

			files[ record.archivePath ] =
record.bytes;

		}

		return files;

	}

	getStats() {

		let totalSize = 0;

		for ( const record of this.assets.values() ) {

			totalSize += record.size;

		}

		return {
			count: this.assets.size,
			totalSize
		};

	}

	restoreFromPackage( entries, zip ) {

		this.clear();

		if ( ! Array.isArray( entries ) ) {

			return;

		}

		for ( const entry of entries ) {

			if (
				! entry ||
typeof entry.archivePath !== 'string'
			) {

				continue;

			}

			const bytes = zip[ entry.archivePath ];

			if ( bytes === undefined ) {

				console.warn(
					'3EXR AssetStore: missing packaged asset',
					entry.archivePath
				);

				continue;

			}

			const record = {

				... entry,

				aliases:
Array.isArray( entry.aliases )
	? [ ... entry.aliases ]
	: [],

				bytes

			};

			this.assets.set(
				record.id,
				record
			);

			if ( record.hash ) {

				this.hashIndex.set(
					record.hash,
					record.id
				);

			}

		}

		console.log(
			'3EXR AssetStore:',
			'restored',
			this.assets.size,
			'assets'
		);

	}

}

export { AssetStore };
