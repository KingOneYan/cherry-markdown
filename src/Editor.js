/**
 * Copyright (C) 2021 THL A29 Limited, a Tencent company.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
// @ts-check
import codemirror from 'codemirror';
import 'codemirror/lib/codemirror.css';
import 'codemirror/mode/markdown/markdown';
import 'codemirror/mode/xml/xml';
import 'codemirror/addon/edit/continuelist';
import 'codemirror/addon/edit/closetag';
import 'codemirror/addon/fold/xml-fold';
import 'codemirror/addon/edit/matchtags';
import 'codemirror/addon/search/searchcursor';
import 'codemirror/addon/display/placeholder';
// import 'codemirror/addon/selection/active-line';
// import 'codemirror/addon/edit/matchbrackets';
import htmlParser from '@/utils/htmlparser';
import pasteHelper from '@/utils/pasteHelper';
import lazyLoadImg from '@/utils/lazyLoadImg';
import Logger from '@/Logger';

/**
 * @typedef {import('~types/editor').EditorConfiguration} EditorConfiguration
 * @typedef {import('~types/editor').EditorEventCallback} EditorEventCallback
 * @typedef {import('codemirror')} CodeMirror
 */

/** @type {import('~types/editor')} */
export default class Editor {
  /**
   * @constructor
   * @param {Partial<EditorConfiguration>} options
   */
  constructor(options) {
    /**
     * @property
     * @type {EditorConfiguration}
     */
    this.options = {
      id: 'code',
      editorDom: document.createElement('div'),
      wrapperDom: null,
      codemirror: {
        lineNumbers: false, // 显示行数
        cursorHeight: 0.85, // 光标高度，0.85好看一些
        indentUnit: 4, // 缩进单位为4
        // styleActiveLine: false, // 当前行背景高亮
        // matchBrackets: true, // 括号匹配
        mode: 'markdown',
        lineWrapping: true, // 自动换行
        indentWithTabs: true, // 缩进用tab表示
        autofocus: true,
        theme: 'default',
        autoCloseTags: true, // 输入html标签时自动补充闭合标签
        extraKeys: { Enter: 'newlineAndIndentContinueMarkdownList' }, // 增加markdown回车自动补全
        matchTags: { bothTags: true }, // 自动高亮选中的闭合html标签
        placeholder: '',
      },
      toolbars: {},
      onKeydown() {},
      onChange() {},
      onFocus() {},
      onBlur() {},
      onPaste: this.onPaste,
      onScroll: this.onScroll,
    };
    /**
     * @property
     * @private
     * @type {{ timer?: number; destinationTop?: number }}
     */
    this.animation = {};
    const { codemirror, ...restOptions } = options;
    if (codemirror) {
      Object.assign(this.options.codemirror, codemirror);
    }
    Object.assign(this.options, restOptions);
  }

  /**
   *
   * @param {ClipboardEvent} e
   * @param {CodeMirror.Editor} codemirror
   */
  onPaste(e, codemirror) {
    let { clipboardData } = e;
    if (clipboardData) {
      this.handlePaste(e, clipboardData, codemirror);
    } else {
      ({ clipboardData } = window);
      this.handlePaste(e, clipboardData, codemirror);
    }
  }

  /**
   *
   * @param {ClipboardEvent} event
   * @param {ClipboardEvent['clipboardData']} clipboardData
   * @param {CodeMirror.Editor} codemirror
   * @returns {boolean | void}
   */
  handlePaste(event, clipboardData, codemirror) {
    const { items } = clipboardData;
    const types = clipboardData.types || [];
    const codemirrorDoc = codemirror.getDoc();
    for (let i = 0; i < types.length; i++) {
      const item = items[i];
      // 判断是否为图片数据
      if (item && item.kind === 'file' && item.type.match(/^image\//i)) {
        // 读取该图片
        const file = item.getAsFile();
        this.options.fileUpload(file, (url) => {
          if (typeof url !== 'string') {
            return;
          }
          codemirrorDoc.replaceSelection(`![enter image description here](${url})`);
        });
        event.preventDefault();
      }
    }

    // 复制html转换markdown
    const htmlText = clipboardData.getData('text/plain');
    let html = clipboardData.getData('Text/Html');
    if (!html) {
      return true;
    }
    const test = html.replace(/<(html|head|body|!)/g, '');
    if (test.match(/<[a-zA-Z]/g).length <= 1 && /<img/.test(test)) {
      return true;
    }
    let divObj = document.createElement('DIV');
    divObj.innerHTML = html;
    html = divObj.innerHTML;
    const mdText = htmlParser.run(html);
    if (typeof mdText === 'string' && mdText.trim().length > 0) {
      const range = codemirror.listSelections();
      if (codemirror.getSelections().length <= 1 && range[0] && range[0].anchor) {
        const currentCursor = {};
        currentCursor.line = range[0].anchor.line;
        currentCursor.ch = range[0].anchor.ch;
        codemirrorDoc.replaceSelection(mdText);
        pasteHelper.showSwitchBtnAfterPasteHtml(currentCursor, codemirror, htmlText, mdText);
      } else {
        codemirrorDoc.replaceSelection(mdText);
      }
      event.preventDefault();
    }
    divObj = null;
  }

  /**
   *
   * @param {CodeMirror.Editor} codemirror
   */
  onScroll = (codemirror) => {
    if (this.disableScrollListener) {
      this.disableScrollListener = false;
      return;
    }
    const scroller = codemirror.getScrollerElement();
    if (scroller.scrollTop <= 0) {
      this.previewer.scrollToLineNum(0);
      return;
    }
    if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 20) {
      this.previewer.scrollToLineNum(null); // 滚动到底
      return;
    }
    const currentTop = codemirror.getScrollInfo().top;
    const targetLine = codemirror.lineAtHeight(currentTop, 'local');
    const lineRect = codemirror.charCoords({ line: targetLine, ch: 0 }, 'local');
    const lineHeight = codemirror.getLineHandle(targetLine).height;
    const lineTop = lineRect.bottom - lineHeight; // 直接用lineRect.top在自动折行时计算的是最后一行的top
    const percent = (100 * (currentTop - lineTop)) / lineHeight / 100;
    // console.log(percent);
    // codemirror中行号以0开始，所以需要+1
    this.previewer.scrollToLineNum(targetLine + 1, percent);
  };

  /**
   *
   * @param {*} previewer
   */
  init(previewer) {
    const textArea = this.options.editorDom.querySelector(`#${this.options.id}`);
    if (!(textArea instanceof HTMLTextAreaElement)) {
      throw new Error('The specific element is not a textarea.');
    }
    const editor = codemirror.fromTextArea(textArea, this.options.codemirror);
    editor.addOverlay({
      name: 'invisibles',
      token: function nextToken(stream) {
        let tokenClass;
        let spaces = 0;
        let peek = stream.peek() === ' ';
        if (peek) {
          while (peek && spaces < Number.MAX_VALUE) {
            spaces += 1;
            stream.next();
            peek = stream.peek() === ' ';
          }
          tokenClass = `whitespace whitespace-${spaces}`;
        } else {
          while (!stream.eol()) {
            stream.next();
          }
          tokenClass = '';
        }
        return tokenClass;
      },
    });
    this.previewer = previewer;
    this.disableScrollListener = false;

    if (this.options.value) {
      editor.setOption('value', this.options.value);
    }

    editor.on('blur', (codemirror, evt) => {
      this.options.onBlur(evt, codemirror);
    });

    editor.on('focus', (codemirror, evt) => {
      this.options.onFocus(evt, codemirror);
    });

    editor.on('change', (codemirror, evt) => {
      this.options.onChange(evt, codemirror);
    });

    editor.on('keydown', (codemirror, evt) => {
      this.options.onKeydown(evt, codemirror);
    });

    editor.on('paste', (codemirror, evt) => {
      this.options.onPaste.call(this, evt, codemirror);
    });

    editor.on('scroll', (codemirror) => {
      this.options.onScroll(codemirror);
    });

    if (previewer.options.isPreviewOnly) {
      previewer.options.afterUpdateCallBack.push(() => {
        lazyLoadImg(previewer.options.previewerDom);
      });
    }
    /**
     * @property
     * @type {CodeMirror.Editor}
     */
    this.editor = editor;
  }

  /**
   *
   * @param {number | null} beginLine 起始行，传入null时跳转到文档尾部
   * @param {number} [endLine] 终止行
   * @param {number} [percent] 百分比，取值0~1
   */
  jumpToLine(beginLine, endLine, percent) {
    if (beginLine === null) {
      cancelAnimationFrame(this.animation.timer);
      this.disableScrollListener = true;
      this.editor.scrollIntoView({
        line: this.editor.lineCount() - 1,
        ch: 1,
      });
      this.animation.timer = 0;
      return;
    }
    const position = this.editor.charCoords({ line: beginLine, ch: 0 }, 'local');
    let { top } = position;
    const positionEnd = this.editor.charCoords({ line: beginLine + endLine, ch: 0 }, 'local');
    const height = positionEnd.top - position.top;
    top += height * percent;
    this.animation.destinationTop = Math.ceil(top - 15);
    if (this.animation.timer) {
      return;
    }
    const animationHandler = () => {
      const currentTop = this.editor.getScrollInfo().top;
      const delta = this.animation.destinationTop - currentTop;
      // 100毫秒内完成动画
      const move = Math.ceil(Math.min(Math.abs(delta), Math.max(1, Math.abs(delta) / (100 / 16.7))));
      // console.log('should scroll: ', move, delta, currentTop, this.animation.destinationTop);
      if (delta > 0) {
        if (currentTop >= this.animation.destinationTop) {
          this.animation.timer = 0;
          return;
        }
        this.disableScrollListener = true;
        this.editor.scrollTo(null, currentTop + move);
      } else if (delta < 0) {
        if (currentTop <= this.animation.destinationTop || currentTop <= 0) {
          this.animation.timer = 0;
          return;
        }
        this.disableScrollListener = true;
        this.editor.scrollTo(null, currentTop - move);
      } else {
        this.animation.timer = 0;
        return;
      }
      // 无法再继续滚动
      if (currentTop === this.editor.getScrollInfo().top || move >= Math.abs(delta)) {
        this.animation.timer = 0;
        return;
      }
      this.animation.timer = requestAnimationFrame(animationHandler);
    };
    this.animation.timer = requestAnimationFrame(animationHandler);
  }

  /**
   *
   * @param {number | null} lineNum
   * @param {number} [endLine]
   * @param {number} [percent]
   */
  scrollToLineNum(lineNum, endLine, percent) {
    if (lineNum === null) {
      this.jumpToLine(null);
      return;
    }
    const $lineNum = Math.max(0, lineNum);
    this.jumpToLine($lineNum, endLine, percent);
    Logger.log('滚动预览区域，左侧应scroll to ', $lineNum);
    if (this.previewer.options.isPreviewOnly) {
      lazyLoadImg(this.previewer.options.previewerDom);
    }
  }

  /**
   *
   * @returns {HTMLElement}
   */
  getEditorDom() {
    return this.options.editorDom;
  }

  /**
   *
   * @param {string} event 事件名
   * @param {EditorEventCallback} callback 回调函数
   */
  addListener(event, callback) {
    this.editor.on(event, callback);
  }
}
