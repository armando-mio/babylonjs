//
//  BabylonMetalCompat.m
//  demo
//
//  Comprehensive runtime patch for Babylon Native v6.x Metal API compatibility
//  with Xcode 26 / iOS 26 Metal SDK.
//
//  Apple renamed / restructured several Metal reflection classes:
//    - MTLRenderPipelineReflectionInternal: vertexArguments → vertexBindings
//    - MTLArgument subclasses (MTLBufferArgument, MTLTextureArgument, etc.)
//      lost the legacy -isUsed / -isActive / -name / -type / -index / -access
//      selectors that Babylon Native v6.14.0 still calls.
//
//  This file dynamically adds the missing selectors at +load time so the app
//  does NOT crash with "unrecognized selector".
//

#import <Foundation/Foundation.h>
#import <Metal/Metal.h>
#import <objc/runtime.h>

// ---------------------------------------------------------------------------
// Helper: add a selector to a class that returns YES (BOOL), returning NO
//         if it already responds.
// ---------------------------------------------------------------------------
static void addBoolYesMethod(Class cls, SEL sel) {
    if (!cls || [cls instancesRespondToSelector:sel]) return;
    IMP imp = imp_implementationWithBlock(^BOOL(id self) { return YES; });
    class_addMethod(cls, sel, imp, "B@:");
}

// Helper: add a selector that returns an NSUInteger 0
static void addUIntZeroMethod(Class cls, SEL sel) {
    if (!cls || [cls instancesRespondToSelector:sel]) return;
    IMP imp = imp_implementationWithBlock(^NSUInteger(id self) { return 0; });
    class_addMethod(cls, sel, imp, "Q@:");
}

// Helper: add a selector that returns nil / empty string
static void addEmptyStringMethod(Class cls, SEL sel) {
    if (!cls || [cls instancesRespondToSelector:sel]) return;
    IMP imp = imp_implementationWithBlock(^NSString *(id self) { return @""; });
    class_addMethod(cls, sel, imp, "@@:");
}

// Helper: add a selector that returns an empty array
static void addEmptyArrayMethod(Class cls, SEL sel) {
    if (!cls || [cls instancesRespondToSelector:sel]) return;
    IMP imp = imp_implementationWithBlock(^NSArray *(id self) { return @[]; });
    class_addMethod(cls, sel, imp, "@@:");
}

// Helper: forward selA → selB on a given class
static void forwardSelector(Class cls, SEL dst, SEL src) {
    if (!cls || [cls instancesRespondToSelector:dst]) return;
    if ([cls instancesRespondToSelector:src]) {
        Method m = class_getInstanceMethod(cls, src);
        class_addMethod(cls, dst, method_getImplementation(m), method_getTypeEncoding(m));
    }
}

// ---------------------------------------------------------------------------
//  Patch a Metal "argument" class (MTLBufferArgument, MTLTextureArgument, …)
//  so it responds to the legacy MTLArgument selectors Babylon Native uses:
//    -isUsed, -isActive, -name, -type, -index, -access,
//    -bufferAlignment, -bufferDataSize, -bufferDataType, -bufferStructType,
//    -bufferPointerType, -arrayLength, -textureType, -textureDataType
// ---------------------------------------------------------------------------
static void patchArgumentClass(const char *className) {
    Class cls = NSClassFromString([NSString stringWithUTF8String:className]);
    if (!cls) return;

    addBoolYesMethod(cls, NSSelectorFromString(@"isUsed"));
    addBoolYesMethod(cls, NSSelectorFromString(@"isActive"));
    addEmptyStringMethod(cls, NSSelectorFromString(@"name"));
    addUIntZeroMethod(cls, NSSelectorFromString(@"type"));
    addUIntZeroMethod(cls, NSSelectorFromString(@"index"));
    addUIntZeroMethod(cls, NSSelectorFromString(@"access"));
    addUIntZeroMethod(cls, NSSelectorFromString(@"bufferAlignment"));
    addUIntZeroMethod(cls, NSSelectorFromString(@"bufferDataSize"));
    addUIntZeroMethod(cls, NSSelectorFromString(@"bufferDataType"));
    addUIntZeroMethod(cls, NSSelectorFromString(@"arrayLength"));
    addUIntZeroMethod(cls, NSSelectorFromString(@"textureType"));
    addUIntZeroMethod(cls, NSSelectorFromString(@"textureDataType"));

    // struct / pointer types → nil is fine
    SEL bufferStructTypeSel = NSSelectorFromString(@"bufferStructType");
    if (![cls instancesRespondToSelector:bufferStructTypeSel]) {
        IMP imp = imp_implementationWithBlock(^id(id self) { return nil; });
        class_addMethod(cls, bufferStructTypeSel, imp, "@@:");
    }
    SEL bufferPointerTypeSel = NSSelectorFromString(@"bufferPointerType");
    if (![cls instancesRespondToSelector:bufferPointerTypeSel]) {
        IMP imp = imp_implementationWithBlock(^id(id self) { return nil; });
        class_addMethod(cls, bufferPointerTypeSel, imp, "@@:");
    }
}

// ---------------------------------------------------------------------------
@interface NSObject (BabylonMetalCompat)
@end

@implementation NSObject (BabylonMetalCompat)

+ (void)load {
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{

        // ================================================================
        //  1.  MTLRenderPipelineReflectionInternal
        //      vertexBindings / fragmentBindings / tileBindings
        // ================================================================
        Class reflCls = NSClassFromString(@"MTLRenderPipelineReflectionInternal");
        if (reflCls) {
            forwardSelector(reflCls,
                            NSSelectorFromString(@"vertexBindings"),
                            NSSelectorFromString(@"vertexArguments"));
            forwardSelector(reflCls,
                            NSSelectorFromString(@"fragmentBindings"),
                            NSSelectorFromString(@"fragmentArguments"));
            forwardSelector(reflCls,
                            NSSelectorFromString(@"tileBindings"),
                            NSSelectorFromString(@"tileArguments"));

            // If even the old selectors don't exist, return empty arrays
            addEmptyArrayMethod(reflCls, NSSelectorFromString(@"vertexBindings"));
            addEmptyArrayMethod(reflCls, NSSelectorFromString(@"fragmentBindings"));
            addEmptyArrayMethod(reflCls, NSSelectorFromString(@"tileBindings"));
        }

        // ================================================================
        //  2.  Patch all known Metal argument internal classes so they
        //      respond to legacy MTLArgument selectors.
        // ================================================================
        const char *argClasses[] = {
            "MTLBufferArgument",
            "MTLTextureArgument",
            "MTLSamplerArgument",
            "MTLThreadgroupArgument",
            "MTLBufferBinding",
            "MTLTextureBinding",
            "MTLSamplerBinding",
            "MTLThreadgroupBinding",
            "MTLArgumentInternal",
            "MTLBindingInternal",
            "_MTLArgument",
            "_MTLBufferArgument",
            "_MTLTextureArgument",
            "_MTLSamplerArgument",
            "_MTLBinding",
            "_MTLBufferBinding",
            "_MTLTextureBinding",
            "_MTLSamplerBinding",
            NULL
        };
        for (int i = 0; argClasses[i] != NULL; i++) {
            patchArgumentClass(argClasses[i]);
        }

        // ================================================================
        //  3.  MTLComputePipelineReflectionInternal (for compute shaders)
        // ================================================================
        Class compReflCls = NSClassFromString(@"MTLComputePipelineReflectionInternal");
        if (compReflCls) {
            forwardSelector(compReflCls,
                            NSSelectorFromString(@"bindings"),
                            NSSelectorFromString(@"arguments"));
            addEmptyArrayMethod(compReflCls, NSSelectorFromString(@"bindings"));
        }
    });
}

@end
