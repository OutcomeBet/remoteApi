function RemoteProxy(config) {
	this.__url = config.url;
	this.__methodSeparator = config.methodSeparator || '.';
	this.addMethods(config.methods || {});
	this.__pendingRequests = [];
	this.__throttledRequest = _.throttle(this.__doBatchRequest, config.throttle || 0, { leading: false });
	this.__promiseConverter = config.promiseConverter;
}

function doRequestServer(requestsData) {
	var requestBody = JSON.stringify({ calls: requestsData });
	return new Promise(function(resolve, reject) {
		$.ajax({
			url: this.__url,
			headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
			data: requestBody,
			type: 'POST',
			dataType: 'json',
			xhrFields: {
				withCredentials: true
			},
			success: function(data) {
				resolve(data.results);
			},
			error: function(jqXHR, status, error) {
				reject(status + ': ' + error);
			}
		});
	}.bind(this));
}

RemoteProxy.prototype = {
	__addPendingRequest: function(method, args) {
		return new Promise(function(resolve, reject) {
			this.__pendingRequests.push({
				method: method,
				args: args.length === 1 ? args[0] : args,
				resolver: {
					promise: this,
					resolve: resolve,
					reject: reject
				}
			});
			this.__throttledRequest();
		}.bind(this));
	},
	__doBatchRequest: function() {
		if(this.__pendingRequests.length === 0) return;
		var requests = this.__pendingRequests.splice(0, this.__pendingRequests.length);
		console.log('Running ' + requests.length + ' requests in a batch:', requests);

		var requestsData = _.map(requests, function(request) { return { method: request.method, args: request.args }; });
		doRequestServer.call(this, requestsData).then(function(responsesData) {
			_.each(responsesData, function(responseData, key) {
				var request = requests[key];
				if(responseData.success) {
					request.resolver.resolve(responseData.response);
				} else {
					request.resolver.reject(responseData.message || responseData);
					var err;
					if('exception' in responseData && 'message' in responseData.exception) {
						err = new Error(responseData.exception.message);
					} else {
						err = new Error('Unknown error. See the Network log for details.');
					}
					request.resolver.reject(err);
				}
			});
		}).catch(function(error) {
			console.error(error);
		});
	},
	__convertObject: function(object, prefix) {
		var proxy = this;
		var converted = {};
		_.each(object, function(value, key, list) {
			if(_.isArray(value)) {
				converted[key] = proxy.__convertObject(_.object(value, []), prefix + key + proxy.__methodSeparator);
			} else if(_.isObject(value)) {
				converted[key] = proxy.__convertObject(value, prefix + key + proxy.__methodSeparator);
			} else {
				var method = prefix + key;
				converted[key] = function() {
					var promise = proxy.__addPendingRequest(method, arguments);
					proxy.__throttledRequest();
					return proxy.__promiseConverter ? proxy.__promiseConverter(promise, method) : promise;
				};
			}
		});
		return converted;
	},
	call: function(method, args) {
		return this.__addPendingRequest(method, args);
	},
	addMethods: function(methods, prefix) {
		_.extend(this, this.__convertObject(methods || {}, prefix || ''));
	},
	createProxy: function(methods, prefix) {
		return this.__convertObject(methods, prefix || '')
	}
};

function RemoteApiError(message) {
	this.message = message;
	var last_part = new Error().stack.match(/[^\s]+$/);
	this.stack = this.name + ' at ' + last_part;
}

Object.setPrototypeOf(RemoteApiError, Error);
RemoteApiError.prototype = Object.create(Error.prototype);
RemoteApiError.prototype.name = 'RemoteApiError';
RemoteApiError.prototype.message = '';
RemoteApiError.prototype.constructor = RemoteApiError;
