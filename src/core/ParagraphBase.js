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
import SyntaxBase, { HOOKS_TYPE_LIST } from './SyntaxBase';

let cacheCounter = 0;
// ~~C${cacheCounter}I${cacheIndex}$
// let cacheMap = {};

export default class ParagraphBase extends SyntaxBase {
  static HOOK_TYPE = HOOKS_TYPE_LIST.PAR;
  // 不需要排他的sign前缀，如~~C0I${IN_PARAGRAPH_CACHE_KEY_PREFIX}sign$
  static IN_PARAGRAPH_CACHE_KEY_PREFIX = '!';
  static IN_PARAGRAPH_CACHE_KEY_PREFIX_REGEX = '\\!';

  constructor({ needCache, defaultCache = {} } = { needCache: false }) {
    super({});
    this.cacheState = !!needCache;
    if (needCache) {
      this.cache = defaultCache || {};
      this.cacheKey = `~~C${cacheCounter}`;
      cacheCounter += 1;
    }
  }

  makeHtml(str, sentenceMakeFunc) {
    return sentenceMakeFunc(str).html;
  }

  afterMakeHtml(html) {
    return this.restoreCache(html);
  }

  isContainsCache(str, fullMatch) {
    if (fullMatch) {
      // 如果是全匹配：不能包含CherryINPRAGRAPH
      const containsParagraphCache = /^(\s*~~C\d+I\w+\$\s*)+$/g.test(str);
      const containsInParagraphCache = new RegExp(
        `~~C\\d+I${ParagraphBase.IN_PARAGRAPH_CACHE_KEY_PREFIX_REGEX}\\w+\\$`,
        'g',
      ).test(str);
      return containsParagraphCache && !containsInParagraphCache;
    }
    // 如果是局部匹配： 不能只包含CherryINPRAGRAPH
    // const containsParagraphCache = /~~C\d+I\w+\$/g.test(str);
    // const containsInParagraphCache = new RegExp(
    //    `~~C\\d+I${ParagraphBase.IN_PARAGRAPH_CACHE_KEY_PREFIX}\\w+\\$`, 'g').test(str);
    const containsNonInParagraphCache = new RegExp(
      `~~C\\d+I(?!${ParagraphBase.IN_PARAGRAPH_CACHE_KEY_PREFIX_REGEX})\\w+\\$`,
      'g',
    ).test(str);
    return containsNonInParagraphCache;

    // return fullMatch ?
    //    /^(\s*~~C\d+I\w+\$\s*)+$/g.test(str) && !/^(\s*~~C\d+ICherryINPRAGRAPH\w+\$\s*)+$/g.test(str) :
    //    /~~C\d+I\w+\$/g.test(str) && !(/~~C\d+ICherryINPRAGRAPH\w+\$/g.test(str)
    //        && !/~~C\d+I(?!CherryINPRAGRAPH)\w+\$/g.test(str));
  }

  /**
   *
   * @param {string} html
   * @return
   */
  $splitHtmlByCache(html) {
    // ~~C0I(?!prefix)sign$
    const regex = new RegExp(`\\n*~~C\\d+I(?!${ParagraphBase.IN_PARAGRAPH_CACHE_KEY_PREFIX_REGEX})\\w+\\$\\n?`, 'g');
    return {
      caches: html.match(regex),
      contents: html.split(regex),
    };
  }

  makeExcludingCached(content, processor) {
    const { caches, contents } = this.$splitHtmlByCache(content);
    const paragraphs = contents.map(processor);
    let ret = '';
    for (let i = 0; i < paragraphs.length; i++) {
      ret += paragraphs[i];
      if (caches && caches[i]) {
        ret += caches[i].trim();
      }
    }
    return ret;
  }

  /**
   *
   * @param {string} md md内容
   * @return {number} 行数
   */
  getLineCount(md) {
    let content = md;
    let preLineCount = content.match(/^\n+/g)?.[0]?.length ?? 0; // 前置换行个数
    preLineCount = preLineCount === 2 ? 1 : 0; // 前置换行超过2个就交给BR进行渲染
    content = content.replace(/^\n+/g, '');

    const regex = new RegExp(
      `\n*~~C\\d+I(?:${ParagraphBase.IN_PARAGRAPH_CACHE_KEY_PREFIX_REGEX})?\\w+_L(\\d+)\\$`,
      'g',
    );
    let cacheLineCount = 0;
    content = content.replace(regex, (match, lineCount) => {
      cacheLineCount += parseInt(lineCount);
      return match.replace(/^\n+/g, '');
    });
    return preLineCount + cacheLineCount + (content.match(/\n/g) || []).length + 1; // 实际内容所占行数，至少为1行
  }

  /**
   *
   * @param {string} str 渲染后的内容
   * @param {string} sign 签名
   * @param {number} lineCount md原文的行数
   * @return {string} cacheKey ~~C0I0_L1$
   */
  pushCache(str, sign = '', lineCount = 0) {
    if (!this.cacheState) {
      return;
    }
    const $sign = sign || this.$engine.md5(str);
    this.cache[$sign] = str;
    return `${this.cacheKey}I${$sign}_L${lineCount}$`;
  }

  popCache(sign) {
    if (!this.cacheState) {
      return;
    }
    return this.cache[sign] || '';
  }

  resetCache(defaultCache) {
    if (!this.cacheState) {
      return;
    }
    this.cache = defaultCache || {};
  }

  restoreCache(html) {
    // restore cached content
    if (!this.cacheState) {
      return html;
    }
    const regex = new RegExp(
      `${this.cacheKey}I((?:${ParagraphBase.IN_PARAGRAPH_CACHE_KEY_PREFIX_REGEX})?\\w+)\\$`,
      'g',
    );
    const $html = html.replace(regex, (match, cacheSign) => this.popCache(cacheSign.replace(/_L\d+/, '')));
    this.resetCache();
    return $html;
  }

  mounted() {
    // console.log('base mounted');
  }

  signWithCache(html) {
    return false;
  }
}
