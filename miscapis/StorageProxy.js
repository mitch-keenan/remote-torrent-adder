// -----------------------------------------------------------------------
class StorageProxyClass {
	constructor(key) {
		this.key = key;

		this.activeSaveOperations = 0;
		this.state = null; 
		this.onChangeListeners = [];
		this.onInitializedListeners = [];
		this.initialized = false;
		
		this._onChange = this._onChange.bind(this)
		chrome.storage.onChanged.addListener(this._onChange);
	}

	_loadFromStorage(onComplete) {
		chrome.storage.local.get([this.key], (result) => {
			this.state = result[this.key]
			if(typeof onComplete === 'function') onComplete(this.state);
		});
	}

	_setInStorage(onComplete) {
		this.activeSaveOperations++;
		chrome.storage.local.set({[this.key]: this.state}, () => {
			this.activeSaveOperations--;
			if(typeof onComplete === 'function') onComplete(this.state);
		});
	}

	_onChange(changes) {
		if(!changes[this.key]) return;
		// TODO: handle problem if oldValue != current;
		this.state = changes[this.key].newValue
		this.onChangeListeners.forEach(ch => ch(this))
	}

	// public methods
	get(key) {
		if(!this.initialized) throw new Error("Attempted to get value in StorageProxy before initialization complete.")
		return this.state[key]
	}

	/**
	 * Synonym for `set`, to increase compatibility with storage api
	 */
	getItem(key) {
		return this.get(key);
	}

	set(key, value) {
		if(!this.initialized) throw new Error("Attempted to set value in StorageProxy before initialization complete.")
		this.state[key] = value;
		this._setInStorage();
		this.onChangeListeners.forEach(ch => ch(this))
	}

	/**
	 * Synonym for `set`, to increase compatibility with storage api
	 */
	setItem(key, value) {
		return this.set(key, value);
	}

	initialize(onInitialized) {
		this._loadFromStorage(() => {
			if(this.state == null) {
				// first time init
				this.state = {}
				this._setInStorage()
			}

			this.initialized = true;
			this.onInitializedListeners.forEach(ch => ch(this))
			this.onInitializedListeners = []
		});
	}

	isInitialized() {
		return this.initialized;
	}

	isUnsaved() {
		return this.activeSaveOperations > 0;
	}

	addChangeListener(listener) {
		this.onChangeListeners.push(listener);
	}

	removeChangeListener(listener) {
		const i = this.onChangeListeners.findIndex(listener);
		if(i == -1) return;
		this.onChangeListeners.splice(i, 1)
	}

	addInitializedListener(listener) {
		if(this.initialized) listener(this);
		else this.onInitializedListeners.push(listener);
	}
}

var StorageProxy = window.StorageProxy = StorageProxyClass;