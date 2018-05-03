ko.subscribable.fn.subscribeAndCall = function koExtensionSubscribeAndCall(callback, context, event) {
    const subscribableValue = this();

    this.subscribe(callback, context, event);

    if (subscribableValue !== undefined) {
        callback.call(context, subscribableValue);
    }
};

// Helper function to create a new notification
PNotify.notice = options => new PNotify(Object.assign(options, { type: 'notice' }));
PNotify.info = options => new PNotify(Object.assign(options, { type: 'info' }));
PNotify.success = options => new PNotify(Object.assign(options, { type: 'success' }));
PNotify.error = options => new PNotify(Object.assign(options, { type: 'error' }));
