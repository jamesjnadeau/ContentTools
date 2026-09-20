/* Loads the bundle under test, then the driver. The bundle is parameterised so the
   identical scenarios can run against the frozen legacy build and against any later
   build, which is what makes this a characterisation oracle rather than a snapshot. */
(function () {
    var params = new URLSearchParams(window.location.search);
    var bundle = params.get('bundle') || '/test/golden/legacy-bundle.js';
    // document.write keeps these strictly ordered and synchronous during parse,
    // so the driver can rely on window.ContentTools already existing.
    document.write('<script src="' + bundle + '"><\/script>');
    document.write('<script src="/test/golden/fixtures/driver.js"><\/script>');
})();
