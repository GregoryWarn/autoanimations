import { buildFile } from "../file-builder/build-filepath.js"
import { aaReturnWeapons, aaRangeWeapons } from "../../database/jb2a-menu-options.js";

export async function melee(handler, animationData) {

    const data = animationData.primary;
    const secondary = animationData.secondary;
    const sourceFX = animationData.sourceFX;
    const targetFX = animationData.targetFX;
    const macro = animationData.macro;

    const sourceToken = handler.sourceToken;
    const sourceTokenGS = (sourceToken.w / canvas.grid.size) * 5;

    const switchDisabled = game.settings.get("autoanimations", "rangeSwitch")

    const switchReturn = data.meleeSwitch.options.switchType === "on" && aaReturnWeapons.includes(data.video.animation)
        ? data.meleeSwitch.options.isReturning
        : data.meleeSwitch.options.switchType === "custom" && aaReturnWeapons.includes(data.meleeSwitch.video.animation)
            ? data.meleeSwitch.options.isReturning
            : false;

    let range = {};
    if (data.meleeSwitch.options.switchType === "on") {
        range = aaRangeWeapons.includes(data.video.animation) && !data.video.customPath ? await buildFile("range", data.video, false) : {};
    } else if (data.meleeSwitch.options.switchType === "custom") {
        range = !data.meleeSwitch?.video?.customPath ? await buildFile("range", data.meleeSwitch.video) : {};
    }

    let switchDistance = 5;
    if (handler.systemId === "swade") { switchDistance = 1 }
    if (handler.systemId === "alienrpg") { switchDistance = canvas.grid.distance * 1.5 }

    let rangeArray = [];
    let meleeArray = [];

    // Compile separate Range and Melee arrays where applicable, with Hit determination for Sequencer Miss effect
    for (let target of handler.allTargets) {
        let distanceTo = handler.getDistance(target);
        let rangeDistance = data.meleeSwitch.detect === "manual"
            ? data.meleeSwitch.range
            : (switchDistance / canvas.dimensions.distance) + handler.reachCheck;
        let hit = !handler.playOnMiss ? true : handler.hitTargetsId.includes(target.id) ? true : false;

        if ((distanceTo > rangeDistance) && range.file && !switchDisabled) {
            rangeArray.push({
                token: target,
                hit
            })
        } else {
            meleeArray.push({
                token: target,
                moveTo: distanceTo > rangeDistance ? true : false,
                hit
            })
        }
    }
    let aaSeq = await new Sequence(handler.sequenceData);
    // Play Macro if Awaiting
    if (macro && macro.playWhen === "1") {
        let userData = macro.args;
        aaSeq.macro(macro.name, handler.workflow, handler, userData)
    }
    // Extra Effects => Source Token if active
    if (sourceFX.enable) {
        aaSeq.addSequence(sourceFX.sourceSeq)
    }
    // Primary Sound
    if (data.sound && meleeArray.length > 0) {
        aaSeq.addSequence(data.sound)
    }
    // Animation Start Hook
    aaSeq.thenDo(function () {
        Hooks.callAll("aa.animationStart", sourceToken, handler.allTargets)
    })

    if (meleeArray.length) {
        for (let i = 0; i < meleeArray.length; i++) {
            let currentTarget = meleeArray[i];

            let meleeSeq = aaSeq.effect()
            meleeSeq.file(data.path.file)
            meleeSeq.opacity(data.options.opacity)
            meleeSeq.atLocation(sourceToken)
            if (currentTarget.moveTo) {
                meleeSeq.moveTowards(currentTarget.token)
            } else {
                meleeSeq.rotateTowards(currentTarget.token)
                meleeSeq.anchor({ x: 0.4, y: 0.5 })
            }
            meleeSeq.size(sourceTokenGS * data.options.size, { gridUnits: true })
            meleeSeq.repeats(data.options.repeat, data.options.repeatDelay)
            meleeSeq.randomizeMirrorY()
            meleeSeq.missed(!currentTarget.hit)
            meleeSeq.name("spot" + ` ${currentTarget.token.id}`)
            meleeSeq.elevation(handler.elevation(sourceToken, data.options.isAbsolute, data.options.elevation), {absolute: data.options.isAbsolute})
            meleeSeq.zIndex(data.options.zIndex)
            if (i === meleeArray.length - 1 && data.options.isWait) {
                meleeSeq.waitUntilFinished(data.options.delay)
            } else if (!data.options.isWait) {
                meleeSeq.delay(data.options.delay)
            }
            meleeSeq.playbackRate(data.options.playbackRate)
        }

        // Secondary animation and sound
        if (secondary) {
            if (secondary.sound) {
                aaSeq.addSequence(secondary.sound)
            }
            for (let i = 0; i < meleeArray.length; i++) {
                let currentTarget = meleeArray[i].token;

                let secondarySeq = aaSeq.effect()
                secondarySeq.atLocation("spot" + ` ${currentTarget.id}`)
                secondarySeq.file(secondary.path?.file)
                secondarySeq.size(secondary.options.size * 2, { gridUnits: true })
                secondarySeq.repeats(secondary.options.repeat, secondary.options.repeatDelay)
                if (i === meleeArray.length - 1 && secondary.options.isWait && targetFX.enable) {
                    secondarySeq.waitUntilFinished(secondary.options.delay)
                } else if (!secondary.options.isWait) {
                    secondarySeq.delay(secondary.options.delay)
                }
                secondarySeq.elevation(handler.elevation(currentTarget, secondary.options.isAbsolute, secondary.options.elevation), {absolute: data.options.isAbsolute})
                secondarySeq.zIndex(secondary.options.zIndex)
                secondarySeq.opacity(secondary.options.opacity)
                secondarySeq.fadeIn(secondary.options.fadeIn)
                secondarySeq.fadeOut(secondary.options.fadeOut)
                if (secondary.options.rotateSource) {
                    secondarySeq.rotateTowards(sourceToken)
                    secondarySeq.rotate(180)    
                }    
                if (secondary.options.isMasked) {
                    secondarySeq.mask(currentTarget)
                }
                secondarySeq.anchor({x: secondary.options.anchor.x, y: secondary.options.anchor.y})
                secondarySeq.playbackRate(secondary.options.playbackRate)
            }
        }

        // Target animation and sound
        if (targetFX.enable) {
            if (targetFX.sound) {
                aaSeq.addSequence(targetFX.sound)
            }
            for (let currentTarget of meleeArray) {
                let checkAnim = Sequencer.EffectManager.getEffects({ object: currentTarget.token, origin: handler.itemUuid }).length > 0;
                if (checkAnim) { continue; }
                if (currentTarget.hit) {
                    let targetSequence = handler.buildTargetSeq(targetFX, currentTarget.token);
                    aaSeq.addSequence(targetSequence.targetSeq)
                }
            }
        }
    }

    if (rangeArray.length) {
        // Switch Sound
        if (data.meleeSwitch?.sound) {
            aaSeq.addSequence(data.meleeSwitch.sound)
        }

        // Range Switch attacks
        for (let i = 0; i < rangeArray.length; i++) {
            let currentTarget = rangeArray[i];

            let rangeSeq = aaSeq.effect()
            rangeSeq.file(range.file)
            rangeSeq.atLocation(sourceToken)
            rangeSeq.stretchTo(currentTarget.token)
            rangeSeq.opacity(data.options.opacity)
            rangeSeq.zIndex(data.options.zIndex)
            rangeSeq.repeats(data.options.repeat, data.options.repeatDelay)
            rangeSeq.missed(!currentTarget.hit)
            rangeSeq.name("rangeSpot" + ` ${currentTarget.token.id}`)
            rangeSeq.elevation(handler.elevation(sourceToken, data.options.isAbsolute, data.options.elevation), {absolute: data.options.isAbsolute})
            rangeSeq.playbackRate(data.options.playbackRate)

            if (i === rangeArray.length - 1 && data.options.isWait) {
                rangeSeq.waitUntilFinished(data.options.delay)
            } else if (!data.options.isWait) {
                rangeSeq.delay(data.options.delay)
            }
        }

        // Return Animation if Enabled
        if (switchReturn) {
            for (let i = 0; i < rangeArray.length; i++) {
                let currentTarget = rangeArray[i].token

                let returnSeq = aaSeq.effect()
                returnSeq.file(data.path.returnFile)
                returnSeq.opacity(data.options.opacity)
                returnSeq.atLocation(sourceToken)
                returnSeq.repeats(data.options.repeat, data.options.repeatDelay)
                returnSeq.stretchTo("rangeSpot" + ` ${currentTarget.id}`)
                returnSeq.zIndex(data.options.zIndex)
                returnSeq.playbackRate(data.options.playbackRate)
            }
        }

        // Secondary animation and sound
        if (secondary) {
            if (secondary.sound) {
                aaSeq.addSequence(secondary.sound)
            }
            for (let i = 0; i < rangeArray.length; i++) {
                let currentTarget = rangeArray[i].token;

                let secondarySeq = aaSeq.effect()
                secondarySeq.atLocation("rangeSpot" + ` ${currentTarget.id}`)
                secondarySeq.file(secondary.path?.file)
                secondarySeq.size(secondary.options.size * 2, { gridUnits: true })
                secondarySeq.repeats(secondary.options.repeat, secondary.options.repeatDelay)
                if (i === rangeArray.length - 1 && secondary.options.isWait && targetFX.enable) {
                    secondarySeq.waitUntilFinished(secondary.options.delay)
                } else if (!secondary.options.isWait) {
                    secondarySeq.delay(secondary.options.delay)
                }
                secondarySeq.elevation(handler.elevation(currentTarget, secondary.options.isAbsolute, secondary.options.elevation), {absolute: secondary.options.isAbsolute})
                secondarySeq.zIndex(secondary.options.zIndex)
                secondarySeq.opacity(secondary.options.opacity)
                secondarySeq.fadeIn(secondary.options.fadeIn)
                secondarySeq.fadeOut(secondary.options.fadeOut)
                if (secondary.options.rotateSource) {
                    secondarySeq.rotateTowards(sourceToken)
                    secondarySeq.rotate(180)    
                }    
                if (secondary.options.isMasked) {
                    secondarySeq.mask(currentTarget)
                }
                secondarySeq.anchor({x: secondary.options.anchor.x, y: secondary.options.anchor.y})
                secondarySeq.playbackRate(secondary.options.playbackRate)
            }
        }

        // Target animation and sound
        if (targetFX.enable) {
            if (targetFX.sound) {
                aaSeq.addSequence(targetFX.sound)
            }
            for (let currentTarget of rangeArray) {
                let checkAnim = Sequencer.EffectManager.getEffects({ object: currentTarget.token, origin: handler.itemUuid }).length > 0;
                if (checkAnim) { continue; }
                if (currentTarget.hit) {
                    let targetSequence = handler.buildTargetSeq(targetFX, currentTarget.token);
                    aaSeq.addSequence(targetSequence.targetSeq)
                }
            }
        }
    }

    // Macro if Concurrent
    if (macro && macro.playWhen === "0") {
        let userData = macro.args;
        new Sequence()
            .macro(macro.name, handler.workflow, handler, userData)
            .play()
    }

    // Macro if Awaiting Animation. This will respect the Delay/Wait options in the Animation chains
    if (macro && macro.playWhen === "3") {
        let userData = macro.args;
        aaSeq.macro(macro.name, handler.workflow, handler, userData)
    }
    
    aaSeq.play()

}