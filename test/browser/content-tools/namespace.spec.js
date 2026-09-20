/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
// Utility functions

describe('ContentTools.getEmbedVideoURL()', function() {

    it('should return a valid video embbed URL from a youtube URL', function() {

        // Embed URL
        const embedURL = 'https://www.youtube.com/embed/t4gjl-uwUHc';
        expect(ContentTools.getEmbedVideoURL(embedURL)).toBe(embedURL);

        // Share URL
        const shareURL = 'https://youtu.be/t4gjl-uwUHc';
        expect(ContentTools.getEmbedVideoURL(shareURL)).toBe(embedURL);

        // Page URL
        const pageURL = 'https://www.youtube.com/watch?v=t4gjl-uwUHc';
        expect(ContentTools.getEmbedVideoURL(pageURL)).toBe(embedURL);

        // Cater for HTTP (convert to HTTPS)
        const insecureURL = 'http://www.youtube.com/watch?v=t4gjl-uwUHc';
        return expect(ContentTools.getEmbedVideoURL(insecureURL)).toBe(embedURL);
    });

    return it('should return a valid video embbed URL from a vimeo URL', function() {

        // Embed URL
        const embedURL = 'https://player.vimeo.com/video/1084537';
        expect(ContentTools.getEmbedVideoURL(embedURL)).toBe(embedURL);

        // Page/Share URL
        const pageURL = 'https://vimeo.com/1084537';
        expect(ContentTools.getEmbedVideoURL(pageURL)).toBe(embedURL);

        // Cater for HTTP (convert to HTTPS)
        const insecureURL = 'http://vimeo.com/1084537';
        return expect(ContentTools.getEmbedVideoURL(insecureURL)).toBe(embedURL);
    });
});