import { Notice, TFile } from 'obsidian';
import type ObsidianAgentPlugin from './main';

async function getBase64Image(app: any, file: TFile): Promise<string> {
    const arrayBuffer = await app.vault.readBinary(file);
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i] as number);
    }
    const btoa = window.btoa(binary);
    return `data:image/${file.extension};base64,${btoa}`;
}

export async function processCanvasNode(plugin: ObsidianAgentPlugin, canvas: any, node: any, tag?: string) {
    new Notice(`Routing request to Cognitive OS${tag ? ` (${tag})` : ''}...`);
    let promptText = "";
    let imageBase64: string | undefined = undefined;

    // Get all connected edges
    const edges = canvas.getEdgesForNode(node);

    // Process all connected nodes (both incoming and outgoing) for context
    for (const edge of edges) {
        // Determine the *other* node connected to this edge
        const otherNode = edge.from.node.id === node.id ? edge.to.node : edge.from.node;
        
        if (otherNode.text) {
            promptText += `[Context Node]: ${otherNode.text}\n\n`;
        } else if (otherNode.file) {
            if (otherNode.file.extension === 'png' || otherNode.file.extension === 'jpg' || otherNode.file.extension === 'jpeg' || otherNode.file.extension === 'webp') {
                imageBase64 = await getBase64Image(plugin.app, otherNode.file);
                promptText += `[Attached Context Image: ${otherNode.file.name}]\n\n`;
            } else if (otherNode.file.extension === 'md') {
                const mdContent = await plugin.app.vault.read(otherNode.file);
                promptText += `[Context File ${otherNode.file.name}]:\n${mdContent}\n\n`;
            }
        }
    }

    // Process the selected node itself
    if (node.text) {
        promptText += node.text;
    } else if (node.file) {
        if (node.file.extension === 'png' || node.file.extension === 'jpg' || node.file.extension === 'jpeg' || node.file.extension === 'webp') {
            imageBase64 = await getBase64Image(plugin.app, node.file);
            promptText += `[Target Image: ${node.file.name}]\n\n`;
        } else if (node.file.extension === 'md') {
            const mdContent = await plugin.app.vault.read(node.file);
            promptText += `[Target File ${node.file.name}]:\n${mdContent}\n\n`;
        }
    }

    // Prepend the tag if it was provided via right-click
    if (tag) {
        promptText = `${tag}\n${promptText}`;
    }

    try {
        const payload: any = { prompt: promptText };
        if (imageBase64) {
            payload.image_base64 = imageBase64;
        }

        const res = await fetch(plugin.settings.cognitiveOSUrl || 'http://127.0.0.1:5000/process', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            throw new Error(`Server returned ${res.status}`);
        }

        const result = await res.json();
        
        // Notify user
        if (result.relative_path) {
            new Notice(`Finished! Synthesis saved and connected.`);
            
            try {
                const file = plugin.app.vault.getAbstractFileByPath(result.relative_path);
                if (file instanceof TFile) {
                    const newNode = canvas.createFileNode({
                        pos: { x: node.x + node.width + 100, y: node.y },
                        file: file,
                        size: { width: 400, height: 600 }
                    });
                    
                    if (typeof canvas.addEdge === 'function') {
                        canvas.addEdge({
                            from: node,
                            fromSide: 'right',
                            to: newNode,
                            toSide: 'left'
                        });
                    }
                    canvas.requestSave();
                }
            } catch (e) {
                console.error("Failed to add file node to canvas:", e);
            }
        } else if (result.response) {
            new Notice("Finished Processing Canvas Node!");
            
            try {
                const newNode = canvas.createTextNode({
                    pos: { x: node.x + node.width + 100, y: node.y },
                    text: result.response,
                    size: { width: 400, height: 600 }
                });
                
                if (typeof canvas.addEdge === 'function') {
                    canvas.addEdge({
                        from: node,
                        fromSide: 'right',
                        to: newNode,
                        toSide: 'left'
                    });
                }
                canvas.requestSave();
            } catch (e) {
                console.error("Failed to add text node to canvas:", e);
            }
        }
        console.log("Cognitive OS Result:", result);

    } catch (err) {
        console.error("Cognitive OS Error:", err);
        new Notice("Failed to process with Cognitive OS. Is the server running?");
    }
}
