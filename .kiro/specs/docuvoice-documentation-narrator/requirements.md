# Requirements Document

## Introduction

DocuVoice is a web application that converts technical documentation and README files into navigable, multi-voice audio podcast experiences. Users provide a URL or raw Markdown/text, and the system parses the content into typed sections, generates speech audio for each section using distinct ElevenLabs voices, adds sound effects between transitions, and presents the result in a podcast-style player with download capability.

## Glossary

- **DocuVoice**: The web application described in this document.
- **Content_Fetcher**: The backend component responsible for retrieving content from a given URL.
- **Parser**: The backend component responsible for parsing Markdown/HTML into structured sections.
- **Section**: A discrete unit of parsed content with an assigned type (e.g., introduction, code, warning, steps).
- **Section_Type**: A classification applied to a section that determines voice assignment. Valid types are: `introduction`, `code`, `warning`, `steps`.
- **TTS_Engine**: The backend component that calls the ElevenLabs Text-to-Speech API to generate audio for a section.
- **SFX_Engine**: The backend component that calls the ElevenLabs Sound Effects API to generate transition audio.
- **Audio_Timeline**: The ordered sequence of audio segments (section audio + transition effects) that forms the final podcast.
- **Player**: The frontend React component that plays, navigates, and displays the Audio_Timeline.
- **Voice_Map**: The static mapping of Section_Type to ElevenLabs voice ID used by the TTS_Engine.
- **ElevenLabs API**: The third-party API used for text-to-speech, sound effects, and background music generation.
- **Background_Music**: An optional low-volume ambient audio track mixed under the spoken content.

---

## Requirements

### Requirement 1: URL Content Fetching

**User Story:** As a user, I want to paste a URL pointing to a GitHub README or documentation page, so that DocuVoice can automatically retrieve and process the content without manual copying.

#### Acceptance Criteria

1. WHEN a user submits a valid HTTP or HTTPS URL, THE Content_Fetcher SHALL retrieve the raw content of the page within 10 seconds.
2. WHEN a user submits a URL that returns a non-2xx HTTP status code, THE Content_Fetcher SHALL return a descriptive error message identifying the HTTP status code received.
3. WHEN a user submits a malformed URL, THE Content_Fetcher SHALL return an error message indicating the URL is invalid before making any network request.
4. WHEN a user submits a GitHub repository URL (e.g., `https://github.com/owner/repo`), THE Content_Fetcher SHALL resolve and fetch the raw README file for that repository.
5. IF the Content_Fetcher cannot retrieve content within 10 seconds, THEN THE Content_Fetcher SHALL return a timeout error message.

---

### Requirement 2: Direct Markdown/Text Input

**User Story:** As a user, I want to paste raw Markdown or plain text directly into the app, so that I can convert content that is not publicly accessible via URL.

#### Acceptance Criteria

1. THE DocuVoice SHALL accept raw Markdown or plain text input of up to 50,000 characters via a text input field.
2. WHEN a user submits raw text input, THE Parser SHALL process the text directly without any network fetch.
3. IF a user submits an empty input, THEN THE DocuVoice SHALL display a validation error and prevent submission.

---

### Requirement 3: Content Parsing and Section Classification

**User Story:** As a user, I want the app to intelligently split my documentation into typed sections, so that each section can be read with an appropriate voice.

#### Acceptance Criteria

1. WHEN content is provided, THE Parser SHALL split it into an ordered list of Sections.
2. THE Parser SHALL assign each Section exactly one Section_Type from the set: `introduction`, `code`, `warning`, `steps`.
3. WHEN a Markdown fenced code block is detected, THE Parser SHALL assign that Section the `code` Section_Type.
4. WHEN a Markdown blockquote or admonition containing the words "warning", "caution", "danger", or "note" is detected, THE Parser SHALL assign that Section the `warning` Section_Type.
5. WHEN a Markdown ordered or unordered list is detected as a standalone section, THE Parser SHALL assign that Section the `steps` Section_Type.
6. WHEN a section cannot be classified as `code`, `warning`, or `steps`, THE Parser SHALL assign it the `introduction` Section_Type.
7. THE Parser SHALL strip all HTML tags from section text before returning the Section content.
8. THE Parser SHALL preserve the original document order of Sections in the returned list.
9. WHEN parsing produces zero Sections from non-empty input, THE Parser SHALL return an error indicating the content could not be parsed.

---

### Requirement 4: Voice Mapping

**User Story:** As a developer, I want each section type to be consistently mapped to a specific ElevenLabs voice, so that listeners can distinguish content types by voice.

#### Acceptance Criteria

1. THE Voice_Map SHALL assign the ElevenLabs voice "Rachel" to all Sections with Section_Type `introduction`.
2. THE Voice_Map SHALL assign the ElevenLabs voice "Adam" to all Sections with Section_Type `code`.
3. THE Voice_Map SHALL assign the ElevenLabs voice "Antoni" to all Sections with Section_Type `warning`.
4. THE Voice_Map SHALL assign the ElevenLabs voice "Bella" to all Sections with Section_Type `steps`.
5. THE TTS_Engine SHALL use the Voice_Map to select the voice ID for each Section before calling the ElevenLabs API.

---

### Requirement 5: Text-to-Speech Audio Generation

**User Story:** As a user, I want each section of my documentation read aloud with its assigned voice, so that I can listen to the content as a podcast.

#### Acceptance Criteria

1. WHEN audio generation is requested, THE TTS_Engine SHALL call the ElevenLabs Text-to-Speech API for each Section using the voice ID from the Voice_Map.
2. THE TTS_Engine SHALL generate audio for all Sections before assembling the Audio_Timeline.
3. IF the ElevenLabs Text-to-Speech API returns an error for a Section, THEN THE TTS_Engine SHALL retry the request once before returning an error to the caller.
4. WHEN all Section audio files are generated, THE TTS_Engine SHALL return the ordered list of audio file references.
5. THE TTS_Engine SHALL complete audio generation for a document of up to 20 Sections within 30 seconds.

---

### Requirement 6: Sound Effect Transitions

**User Story:** As a user, I want subtle sound effects between sections, so that the audio experience feels polished and section changes are clearly signaled.

#### Acceptance Criteria

1. WHEN assembling the Audio_Timeline, THE SFX_Engine SHALL insert a transition sound effect between each consecutive pair of Sections.
2. THE SFX_Engine SHALL generate transition sound effects using the ElevenLabs Sound Effects API with a prompt describing a subtle whoosh or chime.
3. THE SFX_Engine SHALL limit each transition sound effect to a maximum duration of 2 seconds.
4. IF the ElevenLabs Sound Effects API returns an error, THEN THE SFX_Engine SHALL omit the transition effect for that gap and continue assembling the Audio_Timeline.

---

### Requirement 7: Background Music (Optional Feature)

**User Story:** As a user, I want the option to add low-volume ambient background music, so that the podcast experience feels more immersive.

#### Acceptance Criteria

1. WHERE background music is enabled by the user, THE DocuVoice SHALL generate an ambient background music track using the ElevenLabs music generation API.
2. WHERE background music is enabled, THE Audio_Timeline SHALL mix the background music track at a volume level no greater than 20% of the spoken audio volume.
3. WHERE background music is disabled, THE Audio_Timeline SHALL contain no background music track.

---

### Requirement 8: Audio Timeline Assembly

**User Story:** As a user, I want all audio segments combined into a single playable timeline, so that I can listen to the full document without manual navigation between files.

#### Acceptance Criteria

1. THE Audio_Timeline SHALL contain Section audio segments in the same order as the parsed Sections.
2. THE Audio_Timeline SHALL contain a transition sound effect between each consecutive pair of Section audio segments.
3. THE DocuVoice SHALL make the assembled Audio_Timeline available for streaming playback within the Player.
4. THE DocuVoice SHALL make the assembled Audio_Timeline available for download as an MP3 file.

---

### Requirement 9: Podcast-Style Player UI

**User Story:** As a user, I want a podcast-style player interface, so that I can control playback and navigate between sections easily.

#### Acceptance Criteria

1. THE Player SHALL display Play and Pause controls that start and stop Audio_Timeline playback.
2. THE Player SHALL display Previous Section and Next Section controls that move playback to the start of the preceding or following Section.
3. THE Player SHALL display a progress bar showing the current playback position relative to the total Audio_Timeline duration.
4. THE Player SHALL display a section list sidebar showing the title and Section_Type of each Section.
5. WHEN a user clicks a section in the sidebar, THE Player SHALL seek playback to the start of that Section.
6. WHILE a Section is playing, THE Player SHALL highlight that Section in the sidebar.
7. THE Player SHALL display a Download button that triggers download of the Audio_Timeline as an MP3 file.

---

### Requirement 10: Available Voices Endpoint

**User Story:** As a developer, I want an API endpoint that returns available ElevenLabs voices, so that voice mappings can be verified and extended in the future.

#### Acceptance Criteria

1. WHEN a GET request is made to `/api/voices`, THE DocuVoice SHALL return a list of available ElevenLabs voices retrieved from the ElevenLabs API.
2. IF the ElevenLabs API is unavailable, THEN THE DocuVoice SHALL return a cached or static list of voices with an indicator that the list may be stale.

---

### Requirement 11: Mobile Responsiveness

**User Story:** As a user, I want to use DocuVoice on my mobile device, so that I can listen to documentation on the go.

#### Acceptance Criteria

1. THE Player SHALL render correctly on viewport widths from 320px to 2560px without horizontal scrolling.
2. THE Player SHALL display touch-friendly controls with a minimum tap target size of 44x44 pixels on mobile viewports.
3. WHILE audio is playing on a mobile device, THE Player SHALL continue playback when the browser tab is in the background.

---

### Requirement 12: End-to-End Processing Time

**User Story:** As a user, I want to receive audio within 30 seconds of submitting a GitHub README URL, so that the experience feels responsive.

#### Acceptance Criteria

1. WHEN a user submits a valid GitHub README URL, THE DocuVoice SHALL complete content fetching, parsing, and audio generation and make the Audio_Timeline available for playback within 30 seconds.
2. WHILE audio generation is in progress, THE DocuVoice SHALL display a progress indicator to the user.

---

### Requirement 13: API Authentication and Security

**User Story:** As a developer, I want the ElevenLabs API key to be stored and used securely, so that credentials are not exposed to end users.

#### Acceptance Criteria

1. THE DocuVoice SHALL read the ElevenLabs API key exclusively from the `ELEVENLABS_API_KEY` environment variable.
2. THE DocuVoice SHALL never include the ElevenLabs API key in any response sent to the frontend client.
3. IF the `ELEVENLABS_API_KEY` environment variable is not set at startup, THEN THE DocuVoice SHALL log an error and refuse to start.

---

### Requirement 14: Error Handling UI

**User Story:** As a user, I want to see a clear, friendly error message when a URL is unreachable or the content is too short to narrate, so that I understand what went wrong and can take corrective action.

#### Acceptance Criteria

1. WHEN the Content_Fetcher returns an error for a submitted URL, THE DocuVoice SHALL display a human-readable error message in the UI identifying the cause (e.g., unreachable host, HTTP error code, timeout).
2. WHEN the Parser produces fewer than 3 Sections from the submitted content, THE DocuVoice SHALL display an error message indicating the content is too short to narrate and prevent audio generation.
3. WHEN submitted raw text contains fewer than 100 characters, THE DocuVoice SHALL display a validation error indicating the content is too short before making any API call.
4. IF an error occurs during audio generation, THEN THE DocuVoice SHALL display an error message identifying which step failed (fetching, parsing, or audio generation) and offer the user the option to retry.
5. THE DocuVoice SHALL display all error messages in a dismissible UI component without navigating away from the current page.

---

### Requirement 15: Section-Level Voice Preview

**User Story:** As a user, I want a play button next to each section in the sidebar, so that I can replay individual sections independently without restarting the full Audio_Timeline.

#### Acceptance Criteria

1. THE Player SHALL display a play button adjacent to each Section entry in the sidebar.
2. WHEN a user clicks the play button for a Section, THE Player SHALL seek to the start of that Section and begin playback.
3. WHILE a Section is playing via its sidebar play button, THE Player SHALL highlight that Section's play button to indicate active playback.
4. WHEN a Section finishes playing after being triggered from the sidebar play button, THE Player SHALL pause playback and return focus to that Section in the sidebar.
5. THE Player SHALL display the sidebar play buttons with a minimum tap target size of 44x44 pixels on mobile viewports.

---

### Requirement 16: Processing Progress Indicator

**User Story:** As a user, I want to see a step-by-step progress indicator during audio generation, so that I know the system is working and understand which stage is currently in progress.

#### Acceptance Criteria

1. WHILE audio generation is in progress, THE DocuVoice SHALL display a step-by-step progress indicator showing the following ordered steps: "Parsing content", "Generating voices", "Adding transitions", "Ready".
2. THE DocuVoice SHALL update the progress indicator to mark each step as complete when that step finishes.
3. THE DocuVoice SHALL highlight the currently active step in the progress indicator.
4. WHEN audio generation completes successfully, THE DocuVoice SHALL display the "Ready" step as complete and transition the UI to the Player view.
5. IF audio generation fails at any step, THEN THE DocuVoice SHALL mark the failed step with an error indicator and stop advancing the progress indicator.

---

### Requirement 17: Export Options

**User Story:** As a user, I want to download individual section audio files or the full combined MP3, so that I can use the audio content in other contexts.

#### Acceptance Criteria

1. THE Player SHALL display a "Download Full Audio" button that triggers download of the complete Audio_Timeline as a single MP3 file.
2. THE Player SHALL display a "Download Section" button for each Section in the sidebar that triggers download of that Section's individual audio file as an MP3.
3. WHEN a user clicks "Download Full Audio", THE DocuVoice SHALL initiate a browser download of the assembled Audio_Timeline MP3 with a filename derived from the document title.
4. WHEN a user clicks a "Download Section" button, THE DocuVoice SHALL initiate a browser download of that Section's audio MP3 with a filename that includes the Section index and Section_Type.
5. THE DocuVoice SHALL make individual Section audio files available for download without requiring re-generation if the Audio_Timeline has already been assembled.

---

### Requirement 18: Demo Mode

**User Story:** As a developer, I want a demo mode that loads a hardcoded example README instantly without making any API calls, so that the application can be demonstrated quickly without requiring live credentials or network access.

#### Acceptance Criteria

1. THE DocuVoice SHALL include a "Load Demo" button on the input screen that activates Demo Mode.
2. WHEN Demo Mode is activated, THE DocuVoice SHALL load a hardcoded example README (based on React or Next.js documentation) without making any network requests to external URLs or the ElevenLabs API.
3. WHEN Demo Mode is activated, THE DocuVoice SHALL display pre-generated or bundled audio assets for the hardcoded content so that the Player is immediately available.
4. WHILE Demo Mode is active, THE DocuVoice SHALL display a visible "Demo Mode" indicator so that users know they are not viewing live-generated content.
5. THE DocuVoice SHALL allow the user to exit Demo Mode and return to the standard input screen at any time.
