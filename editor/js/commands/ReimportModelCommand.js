import { Command } from '../Command.js';
import {
	AnimationClip,
	ObjectLoader
} from 'three';

function cloneData( value ) {

	return JSON.parse(
		JSON.stringify( value || {} )
	);

}

function serializeAnimations( animations ) {

	return ( animations || [] ).map(
		clip => AnimationClip.toJSON( clip )
	);

}

function parseAnimations( animations ) {

	return ( animations || [] ).map(
		clip => AnimationClip.parse( clip )
	);

}

class ReimportModelCommand extends Command {

	constructor(
		editor,
		target = null,
		replacement = null
	) {

		super( editor );

		this.type = 'ReimportModelCommand';
		this.name = 'Reimport Model';

		this.target = target;
		this.replacement = replacement;

		this.isScene =
target === editor.scene;

		this.parent = null;
		this.index = - 1;

		this.oldSceneChildren = [];
		this.newSceneChildren = [];

		this.oldSceneUserData = {};
		this.newSceneUserData = {};

		this.oldSceneAnimations = [];
		this.newSceneAnimations = [];

		if (
			target === null ||
replacement === null
		) {

			return;

		}

		if ( this.isScene ) {

			this.prepareSceneReplacement();

		} else {

			this.prepareObjectReplacement();

		}

	}

	prepareObjectReplacement() {

		const target = this.target;
		const replacement = this.replacement;

		this.parent = target.parent;

		if ( this.parent === null ) {

			throw new Error(
				'Reimport target has no parent.'
			);

		}

		this.index =
this.parent.children.indexOf(
	target
);

		replacement.name = target.name;

		replacement.position.copy(
			target.position
		);

		replacement.quaternion.copy(
			target.quaternion
		);

		replacement.scale.copy(
			target.scale
		);

		replacement.visible =
target.visible;

		replacement.renderOrder =
target.renderOrder;

		replacement.matrixAutoUpdate =
target.matrixAutoUpdate;

		replacement.layers.mask =
target.layers.mask;

		if (
			target.matrixAutoUpdate === false
		) {

			replacement.matrix.copy(
				target.matrix
			);

		}

		const oldUserData =
cloneData(
	target.userData
);

		const newUserData =
cloneData(
	replacement.userData
);

		replacement.userData = {
			... oldUserData,
			... newUserData,

			__3exr: {
				... oldUserData.__3exr,
				... newUserData.__3exr
			}
		};

	}

	prepareSceneReplacement() {

		const scene = this.target;
		const replacement = this.replacement;

		const metadata =
scene.userData?.__3exr;

		const boundary =
metadata?.sceneImport
	?.topLevelObjectUuids;

		if (
			! Array.isArray( boundary ) ||
boundary.length === 0
		) {

			const error = new Error(
				'Scene import boundary is missing.'
			);

			error.code =
'SCENE_IMPORT_BOUNDARY_MISSING';

			throw error;

		}

		const boundarySet =
new Set( boundary );

		this.oldSceneChildren =
scene.children
	.map(
		( child, index ) => ( {
			child,
			index
		} )
	)
	.filter(
		entry =>
			boundarySet.has(
				entry.child.uuid
			)
	);

		if (
			this.oldSceneChildren.length === 0
		) {

			const error = new Error(
				'Scene import boundary does not match any objects.'
			);

			error.code =
'SCENE_IMPORT_BOUNDARY_INVALID';

			throw error;

		}

		this.index =
Math.min(
	... this.oldSceneChildren.map(
		entry => entry.index
	)
);

		this.newSceneChildren =
[ ... replacement.children ];

		for (
			const child
			of this.newSceneChildren
		) {

			replacement.remove(
				child
			);

		}

		this.oldSceneUserData =
cloneData(
	scene.userData
);

		const replacementData =
cloneData(
	replacement.userData
);

		this.newSceneUserData = {
			... this.oldSceneUserData,
			... replacementData,

			__3exr: {
				... this.oldSceneUserData.__3exr,
				... replacementData.__3exr,

				sceneImport: {
					topLevelObjectUuids:
this.newSceneChildren.map(
	child => child.uuid
)
				}
			}
		};

		this.oldSceneAnimations =
[ ... scene.animations ];

		this.newSceneAnimations =
[ ... replacement.animations ];

	}

	execute() {

		if ( this.isScene ) {

			this.executeScene();

		} else {

			this.executeObject();

		}

	}

	undo() {

		if ( this.isScene ) {

			this.undoScene();

		} else {

			this.undoObject();

		}

	}

	executeObject() {

		this.editor.removeObject(
			this.target
		);

		this.editor.addObject(
			this.replacement,
			this.parent,
			this.index
		);

		this.editor.select(
			this.replacement
		);

	}

	undoObject() {

		this.editor.removeObject(
			this.replacement
		);

		this.editor.addObject(
			this.target,
			this.parent,
			this.index
		);

		this.editor.select(
			this.target
		);

	}

	executeScene() {

		const scene =
this.editor.scene;

		this.editor.signals
			.sceneGraphChanged.active = false;

		const oldEntries =
[ ... this.oldSceneChildren ]
	.sort(
		( a, b ) =>
			b.index - a.index
	);

		for (
			const entry
			of oldEntries
		) {

			if (
				entry.child.parent === scene
			) {

				this.editor.removeObject(
					entry.child
				);

			}

		}

		for (
			let i = 0;
			i < this.newSceneChildren.length;
			i ++
		) {

			this.editor.addObject(
				this.newSceneChildren[ i ],
				scene,
				this.index + i
			);

		}

		scene.userData =
cloneData(
	this.newSceneUserData
);

		scene.animations =
[ ... this.newSceneAnimations ];

		this.editor.signals
			.sceneGraphChanged.active = true;

		this.editor.signals
			.sceneGraphChanged.dispatch();

		this.editor.select(
			scene
		);

	}

	undoScene() {

		const scene =
this.editor.scene;

		this.editor.signals
			.sceneGraphChanged.active = false;

		for (
			const child
			of [ ... this.newSceneChildren ]
		) {

			if (
				child.parent === scene
			) {

				this.editor.removeObject(
					child
				);

			}

		}

		const oldEntries =
[ ... this.oldSceneChildren ]
	.sort(
		( a, b ) =>
			a.index - b.index
	);

		for (
			const entry
			of oldEntries
		) {

			this.editor.addObject(
				entry.child,
				scene,
				entry.index
			);

		}

		scene.userData =
cloneData(
	this.oldSceneUserData
);

		scene.animations =
[ ... this.oldSceneAnimations ];

		this.editor.signals
			.sceneGraphChanged.active = true;

		this.editor.signals
			.sceneGraphChanged.dispatch();

		this.editor.select(
			scene
		);

	}

	toJSON() {

		const output =
super.toJSON( this );

		output.isScene =
this.isScene;

		output.index =
this.index;

		if ( this.isScene ) {

			output.oldSceneChildren =
this.oldSceneChildren.map(
	entry => ( {
		index: entry.index,
		object:
entry.child.toJSON()
	} )
);

			output.newSceneChildren =
this.newSceneChildren.map(
	child =>
		child.toJSON()
);

			output.oldSceneUserData =
cloneData(
	this.oldSceneUserData
);

			output.newSceneUserData =
cloneData(
	this.newSceneUserData
);

			output.oldSceneAnimations =
serializeAnimations(
	this.oldSceneAnimations
);

			output.newSceneAnimations =
serializeAnimations(
	this.newSceneAnimations
);

		} else {

			output.parentUuid =
this.parent.uuid;

			output.target =
this.target.toJSON();

			output.replacement =
this.replacement.toJSON();

		}

		return output;

	}

	fromJSON( json ) {

		super.fromJSON( json );

		this.isScene =
json.isScene;

		this.index =
json.index;

		const loader =
new ObjectLoader();

		if ( this.isScene ) {

			this.target =
this.editor.scene;

			this.oldSceneChildren =
json.oldSceneChildren.map(
	entry => ( {
		index: entry.index,
		child:
loader.parse(
	entry.object
)
	} )
);

			this.newSceneChildren =
json.newSceneChildren.map(
	object =>
		loader.parse(
			object
		)
);

			this.oldSceneUserData =
cloneData(
	json.oldSceneUserData
);

			this.newSceneUserData =
cloneData(
	json.newSceneUserData
);

			this.oldSceneAnimations =
parseAnimations(
	json.oldSceneAnimations
);

			this.newSceneAnimations =
parseAnimations(
	json.newSceneAnimations
);

		} else {

			this.parent =
this.editor.objectByUuid(
	json.parentUuid
);

			if (
				this.parent === undefined
			) {

				this.parent =
this.editor.scene;

			}

			this.target =
this.editor.objectByUuid(
	json.target.object.uuid
);

			if (
				this.target === undefined
			) {

				this.target =
loader.parse(
	json.target
);

			}

			this.replacement =
this.editor.objectByUuid(
	json.replacement.object.uuid
);

			if (
				this.replacement === undefined
			) {

				this.replacement =
loader.parse(
	json.replacement
);

			}

		}

	}

}

export { ReimportModelCommand };
